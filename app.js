/* Finanzrechner – Oberfläche: Eingaben lesen, Ergebnis und Plan zeigen, Excel-Export. */
(function () {
  "use strict";
  const R = window.Rechner;
  const XLSX_URL = "xlsx.full.min.js"; // SheetJS 0.18.5, lokal (Lizenz: xlsx-LICENSE.txt)
  const RHYTHMUS = { 12: "monatlich", 4: "vierteljährlich", 2: "halbjährlich", 1: "jährlich" };

  const eur = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmt = (x) => eur.format(x);
  const fmtE = (x) => fmt(x) + " €";
  const fmtD = (d) => (d ? d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");

  // "100.000,50" · "100000.5" · "4,25" → Zahl
  function zahl(s) {
    s = String(s || "").trim().replace(/[€%\s]/g, "");
    if (!s) return 0;
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    else if ((s.match(/\./g) || []).length > 1 || /^\d{1,3}\.\d{3}$/.test(s)) s = s.replace(/\./g, "");
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }
  const datum = (s) => {
    if (!s) return null;
    const [j, m, t] = s.split("-").map(Number);
    return new Date(j, m - 1, t);
  };
  const heute = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  // ---------- Speichern (nur Bequemlichkeit) ----------
  const speicher = {
    lesen(k) { try { return JSON.parse(localStorage.getItem("fr_" + k) || "null"); } catch (e) { return null; } },
    schreiben(k, v) { try { localStorage.setItem("fr_" + k, JSON.stringify(v)); } catch (e) { /* egal */ } },
  };

  // ---------- Felder ----------
  function felder(sek) {
    const o = {};
    sek.querySelectorAll("[data-f]").forEach((el) => {
      const f = el.dataset.f;
      if (el.classList.contains("wahl")) o[f] = el.querySelector(".an").dataset.v;
      else if (el.type === "checkbox") o[f] = el.checked;
      else o[f] = el.value;
    });
    return o;
  }
  function setzeFelder(sek, o) {
    if (!o) return;
    sek.querySelectorAll("[data-f]").forEach((el) => {
      const f = el.dataset.f;
      if (!(f in o)) return;
      if (el.classList.contains("wahl"))
        el.querySelectorAll("button").forEach((b) => b.classList.toggle("an", b.dataset.v === o[f]));
      else if (el.type === "checkbox") el.checked = !!o[f];
      else el.value = o[f];
    });
  }

  // ---------- Darstellung ----------
  function werte(sek, liste) {
    sek.querySelector("[data-ergebnis]").innerHTML = liste
      .map((w, i) => `<div class="erg${i === 0 ? " gross" : ""}"><div class="rubrik">${w.name}</div>` +
        `<div class="zahl">${w.zahl}</div>${w.zusatz ? `<div class="zusatz">${w.zusatz}</div>` : ""}</div>`)
      .join("");
    passen(sek);
  }
  // Text nie abschneiden: Schrift verkleinern, bis der Betrag passt
  function passen(sek) {
    sek.querySelectorAll(".erg .zahl").forEach((el) => {
      el.style.fontSize = "";
      let g = parseFloat(getComputedStyle(el).fontSize);
      while (el.scrollWidth > el.clientWidth + 1 && g > 12) el.style.fontSize = (g -= 1) + "px";
    });
  }

  // Gestapelte Säulen je Jahr: unten Blau (Tilgung/Kapital/Einzahlungen), oben Bernstein (Zinsen)
  const fmt0 = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
  function grafik(sek, daten, namen, zusatzName) {
    const box = sek.querySelector("[data-grafik]");
    if (!daten.length) { box.innerHTML = ""; return; }
    const B = 600, H = 210, L = 52, O = 8, U = 22;
    const max = Math.max(...daten.map((d) => d.a + d.b)) || 1;
    const stufe = (() => { const roh = max / 4, p = Math.pow(10, Math.floor(Math.log10(roh)));
      return [1, 2, 2.5, 5, 10].map((f) => f * p).find((x) => x >= roh); })();
    const oben = Math.ceil(max / stufe) * stufe;
    const y = (v) => O + (H - O - U) * (1 - v / oben);
    const n = daten.length, breite = (B - L) / n, sb = Math.max(2, Math.min(28, breite - 2));
    let svg = "";
    for (let v = 0; v <= oben + 1e-9; v += stufe)
      svg += `<line x1="${L}" x2="${B}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(0,0,0,${v ? 0.07 : 0.25})"/>` +
        `<text class="achse" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${fmt0.format(v)}</text>`;
    const r = Math.min(3, sb / 2);
    const saeule = (x, y0, y1, farbe, rund) => {
      const h = y0 - y1; if (h <= 0.3) return "";
      if (!rund || h < r) return `<rect x="${x}" y="${y1}" width="${sb}" height="${h}" fill="${farbe}"/>`;
      return `<path d="M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + sb - r}Q${x + sb},${y1} ${x + sb},${y1 + r}V${y0}Z" fill="${farbe}"/>`;
    };
    const jede = Math.ceil(n / 8);
    daten.forEach((d, k) => {
      const x = L + k * breite + (breite - sb) / 2;
      const ya = y(d.a), yb = y(d.a + d.b);
      svg += saeule(x, y(0), ya, "var(--blau)", d.b <= 0);
      svg += saeule(x, ya - (d.a > 0 && d.b > 0 ? 1 : 0), yb, "var(--bernstein)", true);
      if (k % jede === 0 || k === n - 1)
        svg += `<text class="achse" x="${x + sb / 2}" y="${H - 6}" text-anchor="middle">${d.jahr}</text>`;
      svg += `<rect data-k="${k}" x="${L + k * breite}" y="0" width="${breite}" height="${H - U}" fill="transparent"/>`;
    });
    box.innerHTML = `<svg viewBox="0 0 ${B} ${H}" role="img" aria-label="${namen[0]} und ${namen[1]} je Jahr">${svg}</svg>` +
      `<div class="legende"><span><i style="background:var(--blau)"></i>${namen[0]}</span>` +
      `<span><i style="background:var(--bernstein)"></i>${namen[1]}</span></div><div class="tipp" hidden></div>`;
    const tipp = box.querySelector(".tipp"), el = box.querySelector("svg");
    const zeigeTipp = (ev) => {
      const t = ev.target.closest("[data-k]");
      if (!t) { tipp.hidden = true; return; }
      const d = daten[+t.dataset.k];
      tipp.innerHTML = `<b>Jahr ${d.jahr}</b>${namen[0]} ${fmtE(d.a)}<br>${namen[1]} ${fmtE(d.b)}` +
        (zusatzName ? `<br><span>${zusatzName} ${fmtE(d.c)}</span>` : "");
      tipp.hidden = false;
      const rb = box.getBoundingClientRect(), rt = t.getBoundingClientRect();
      const mitte = rt.left + rt.width / 2 - rb.left;
      tipp.style.left = Math.max(0, Math.min(rb.width - tipp.offsetWidth, mitte - tipp.offsetWidth / 2)) + "px";
      tipp.style.top = "-6px";
      el.querySelectorAll("[data-k]").forEach((x) => x.setAttribute("fill", x === t ? "rgba(0,0,0,0.04)" : "transparent"));
    };
    el.addEventListener("pointermove", zeigeTipp);
    el.addEventListener("pointerdown", zeigeTipp);
    el.addEventListener("pointerleave", () => { tipp.hidden = true;
      el.querySelectorAll("[data-k]").forEach((x) => x.setAttribute("fill", "transparent")); });
  }
  function jeJahr(zeilen, m, nrVon, a, b, c) {
    const out = [];
    zeilen.forEach((z) => {
      const nr = nrVon(z); if (nr == null) return;
      const j = Math.ceil(nr / m);
      let d = out[out.length - 1];
      if (!d || d.jahr !== j) { d = { jahr: j, a: 0, b: 0, c: 0 }; out.push(d); }
      d.a = R.r2(d.a + a(z)); d.b = R.r2(d.b + b(z)); d.c = c(z);
    });
    return out;
  }

  function tabelle(sek, kopf, zeilen, fuss) {
    const th = kopf.map((k) => `<th>${k}</th>`).join("");
    const tr = zeilen.map((z) => `<tr class="${z.klasse || ""}">${z.zellen.map((c, i) =>
      `<td${z.links && z.links.includes(i) ? ' class="links"' : ""}>${c}</td>`).join("")}</tr>`).join("");
    const tf = fuss ? `<tfoot><tr>${fuss.map((c) => `<td>${c}</td>`).join("")}</tr></tfoot>` : "";
    sek.querySelector("[data-tabelle]").innerHTML = `<table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody>${tf}</table>`;
  }
  function fehler(sek, text) {
    const el = sek.querySelector("[data-fehler]");
    el.hidden = !text;
    el.textContent = text || "";
    if (text) {
      sek.querySelector("[data-ergebnis]").innerHTML = "";
      sek.querySelector("[data-tabelle]").innerHTML = "";
      sek.querySelector("[data-grafik]").innerHTML = "";
    }
    return !!text;
  }

  // ---------- Rechner ----------
  const rechner = {
    tilgung(sek) {
      const f = felder(sek);
      const p = {
        betrag: zahl(f.betrag), zins: zahl(f.zins), jahre: zahl(f.jahre), m: Number(f.m),
        start: datum(f.start), vorPerioden: zahl(f.vor), sonderBetrag: zahl(f.sBetrag),
        sonderNr: zahl(f.sNr), sonderModus: f.sModus,
      };
      // Kurzinfo, wenn „Sondertilgung“ zugeklappt ist
      const info = sek.querySelector("[data-info]");
      if (info) info.textContent = p.sonderBetrag > 0
        ? `${fmt0.format(p.sonderBetrag)} € nach Rate ${p.sonderNr}`
        : "keine";
      const n = Math.round(p.jahre * p.m);
      if ([p.betrag, p.zins, p.jahre, p.vorPerioden, p.sonderBetrag, p.sonderNr].some(Number.isNaN))
        return fehler(sek, "Bitte nur Zahlen eingeben.");
      if (p.betrag <= 0) return fehler(sek, "Betrag muss größer als 0 sein.");
      if (p.zins < 0 || p.zins > 100) return fehler(sek, "Zinssatz zwischen 0 und 100 % eingeben.");
      if (n < 1 || n > 1200) return fehler(sek, "Laufzeit ergibt keine sinnvolle Zahl an Raten (1 bis 1.200).");
      if (Math.abs(p.jahre * p.m - n) > 1e-6) return fehler(sek, `Laufzeit passt nicht zum Rhythmus (${RHYTHMUS[p.m]}).`);
      if (p.vorPerioden < 0 || p.vorPerioden > 600 || !Number.isInteger(p.vorPerioden)) return fehler(sek, "Vorfinanzierung: ganze Zahl an Perioden eingeben.");
      if (p.sonderBetrag > 0 && (p.sonderNr < 1 || !Number.isInteger(p.sonderNr))) return fehler(sek, "Sondertilgung: Ratennummer angeben (ab 1).");
      fehler(sek, "");

      const e = R.tilgungsplan(p);
      const liste = [
        { name: "Rate", zahl: fmtE(e.rate), akzent: true, zusatz: RHYTHMUS[p.m] },
        { name: "Zinsen gesamt", zahl: fmtE(e.zinsen) },
        { name: "Zahlungen gesamt", zahl: fmtE(e.gesamt), zusatz: e.sonder ? "inkl. Sondertilgung " + fmtE(e.sonder) : "" },
        { name: "Anzahl Zahlungen", zahl: String(e.anzahl), zusatz: e.ende ? "letzte am " + fmtD(e.ende) : "" },
      ];
      if (p.vorPerioden > 0)
        liste.splice(1, 0, { name: "Zinsrate Vorfinanzierung", zahl: fmtE(e.zeilen[0].rate), zusatz: p.vorPerioden + " Perioden" });
      if (e.rateNeu) liste.splice(1, 0, { name: "Rate nach Sondertilgung", zahl: fmtE(e.rateNeu), akzent: true });
      werte(sek, liste);
      grafik(sek, jeJahr(e.zeilen, p.m, (z) => z.nr, (z) => z.tilgung + z.sonder, (z) => z.zins, (z) => z.rest),
        ["Tilgung", "Zinsen"], "Restschuld");

      const mitDatum = !!p.start;
      const kopf = ["Nr.", ...(mitDatum ? ["Datum"] : []), "Rate", "Zins", "Tilgung", ...(e.sonder ? ["Sondertilg."] : []), "Restschuld"];
      const zeilen = e.zeilen.map((z) => ({
        klasse: z.art === "Vorfinanzierung" ? "vor" : z.sonder ? "sonder" : "",
        links: [0],
        zellen: [z.nr, ...(mitDatum ? [fmtD(z.datum)] : []), fmt(z.rate), fmt(z.zins), fmt(z.tilgung),
          ...(e.sonder ? [z.sonder ? fmt(z.sonder) : ""] : []), fmt(z.rest)],
      }));
      const summeTilg = R.r2(e.zeilen.reduce((a, z) => a + z.tilgung, 0));
      const fuss = ["Summe", ...(mitDatum ? [""] : []), fmt(R.r2(e.gesamt - e.sonder)), fmt(e.zinsen), fmt(summeTilg),
        ...(e.sonder ? [fmt(e.sonder)] : []), ""];
      tabelle(sek, kopf, zeilen, fuss);

      return {
        datei: "Tilgungsplan",
        eckdaten: [
          ["Französischer Tilgungsplan"], [],
          ["Betrag", p.betrag], ["Zinssatz p.a. (%)", p.zins], ["Laufzeit (Jahre)", p.jahre],
          ["Rhythmus", RHYTHMUS[p.m]], ["Auszahlung", p.start || ""], ["Vorfinanzierung (Perioden)", p.vorPerioden],
          ["Sondertilgung", p.sonderBetrag], ["nach Rate Nr.", p.sonderBetrag ? p.sonderNr : ""],
          ["danach", p.sonderBetrag ? (p.sonderModus === "rate" ? "Rate senken" : "Laufzeit kürzen") : ""], [],
          ["Rate", e.rate], ["Rate nach Sondertilgung", e.rateNeu || ""], ["Zinsen gesamt", e.zinsen],
          ["Zahlungen gesamt", e.gesamt], ["Anzahl Zahlungen", e.anzahl],
        ],
        plan: [["Nr.", "Datum", "Art", "Rate", "Zins", "Tilgung", "Sondertilgung", "Restschuld"],
          ...e.zeilen.map((z) => [z.nr, z.datum || "", z.art, z.rate, z.zins, z.tilgung, z.sonder, z.rest])],
      };
    },

    endwert(sek) {
      const f = felder(sek);
      const p = { rate: zahl(f.rate), zins: zahl(f.zins), jahre: zahl(f.jahre), m: Number(f.m), startkapital: zahl(f.start) };
      const n = Math.round(p.jahre * p.m);
      if ([p.rate, p.zins, p.jahre, p.startkapital].some(Number.isNaN)) return fehler(sek, "Bitte nur Zahlen eingeben.");
      if (p.rate < 0 || p.startkapital < 0) return fehler(sek, "Beträge dürfen nicht negativ sein.");
      if (p.zins < -100 || p.zins > 100) return fehler(sek, "Zinssatz zwischen −100 und 100 % eingeben.");
      if (n < 1 || n > 1200) return fehler(sek, "Dauer ergibt keine sinnvolle Zahl an Perioden (1 bis 1.200).");
      if (Math.abs(p.jahre * p.m - n) > 1e-6) return fehler(sek, `Dauer passt nicht zum Rhythmus (${RHYTHMUS[p.m]}).`);
      fehler(sek, "");

      const e = R.endwert(p);
      werte(sek, [
        { name: "Endwert", zahl: fmtE(e.endwert), akzent: true, zusatz: "nach " + e.anzahl + " Einzahlungen" },
        { name: "Einzahlungen gesamt", zahl: fmtE(e.einzahlungen), zusatz: p.startkapital ? "inkl. Startkapital" : "" },
        { name: "Zinsertrag", zahl: fmtE(e.zinsen) },
      ]);
      let sumE = p.startkapital, sumZ = 0;
      grafik(sek, e.jahre.map((j) => { sumE = R.r2(sumE + j.einzahlung); sumZ = R.r2(sumZ + j.zins);
        return { jahr: j.jahr, a: sumE, b: sumZ, c: j.stand }; }), ["Einzahlungen", "Zinsen"], "Kontostand");
      tabelle(sek, ["Jahr", "Einzahlungen", "Zinsen", "Kontostand"],
        e.jahre.map((j) => ({ links: [0], zellen: [j.jahr, fmt(j.einzahlung), fmt(j.zins), fmt(j.stand)] })),
        ["Summe", fmt(R.r2(p.rate * e.anzahl)), fmt(e.zinsen), fmt(e.endwert)]);

      return {
        datei: "Endwert",
        eckdaten: [
          ["Endwert periodischer Einzahlungen (nachschüssig)"], [],
          ["Einzahlung je Periode", p.rate], ["Zinssatz p.a. (%)", p.zins], ["Dauer (Jahre)", p.jahre],
          ["Rhythmus", RHYTHMUS[p.m]], ["Startkapital", p.startkapital], [],
          ["Endwert", e.endwert], ["Einzahlungen gesamt", e.einzahlungen], ["Zinsertrag", e.zinsen],
        ],
        plan: [["Periode", "Einzahlung", "Zins", "Kontostand"], ...e.perioden.map((z) => [z.nr, z.einzahlung, z.zins, z.stand])],
        jahre: [["Jahr", "Einzahlungen", "Zinsen", "Kontostand"], ...e.jahre.map((j) => [j.jahr, j.einzahlung, j.zins, j.stand])],
      };
    },

    leasing(sek) {
      const f = felder(sek);
      const preis = zahl(f.preis);
      const anzRoh = zahl(f.anz), rwRoh = zahl(f.rw);
      const p = {
        preis, zins: zahl(f.zins), monate: zahl(f.monate), m: Number(f.m), start: datum(f.start), vorschuessig: !!f.vorsch,
        anzahlung: R.r2(f.anzE === "%" ? (preis * anzRoh) / 100 : anzRoh),
        restwert: R.r2(f.rwE === "%" ? (preis * rwRoh) / 100 : rwRoh),
      };
      const schritt = 12 / p.m;
      if ([preis, anzRoh, rwRoh, p.zins, p.monate].some(Number.isNaN)) return fehler(sek, "Bitte nur Zahlen eingeben.");
      if (preis <= 0) return fehler(sek, "Kaufpreis muss größer als 0 sein.");
      if (p.anzahlung < 0 || p.restwert < 0) return fehler(sek, "Anzahlung und Restwert dürfen nicht negativ sein.");
      if (p.anzahlung >= preis) return fehler(sek, "Anzahlung muss kleiner als der Kaufpreis sein.");
      if (p.zins < 0 || p.zins > 100) return fehler(sek, "Zinssatz zwischen 0 und 100 % eingeben.");
      if (p.monate < 1 || p.monate > 600 || !Number.isInteger(p.monate)) return fehler(sek, "Laufzeit: ganze Zahl an Monaten (1 bis 600).");
      if (p.monate % schritt) return fehler(sek, `Laufzeit (${p.monate} Monate) passt nicht zum Rhythmus (${RHYTHMUS[p.m]}).`);
      fehler(sek, "");

      const e = R.leasing(p);
      if (!(e.rate > 0)) return fehler(sek, "Restwert ist zu hoch: Es ergibt sich keine positive Rate.");
      werte(sek, [
        { name: "Leasingrate", zahl: fmtE(e.rate), akzent: true, zusatz: RHYTHMUS[p.m] + ", " + (p.vorschuessig ? "vorschüssig" : "nachschüssig") },
        { name: "Anzahl Raten", zahl: String(e.anzahl) },
        { name: "Anzahlung", zahl: fmtE(p.anzahlung) },
        { name: "Restwert", zahl: fmtE(p.restwert) },
        { name: "Zinsen gesamt", zahl: fmtE(e.zinsen) },
        { name: "Gesamtkosten", zahl: fmtE(e.gesamt), zusatz: "Mehrkosten " + fmtE(e.mehrkosten) },
      ]);
      grafik(sek, jeJahr(e.zeilen, p.m, (z) => (z.art === "Rate" ? z.nr : null), (z) => z.kapital, (z) => z.zins, (z) => z.rest),
        ["Kapital", "Zinsen"], "Restschuld");
      const mitDatum = !!p.start;
      const kopf = ["Nr.", ...(mitDatum ? ["Datum"] : []), "Art", "Zahlung", "Zins", "Kapital", "Restschuld"];
      tabelle(sek, kopf, e.zeilen.map((z) => ({
        klasse: z.art === "Anzahlung" ? "anz" : z.art === "Kaufoption" ? "kauf" : "",
        links: mitDatum ? [0, 2] : [0, 1],
        zellen: [z.art === "Rate" ? z.nr : "", ...(mitDatum ? [fmtD(z.datum)] : []), z.art, fmt(z.rate), fmt(z.zins), fmt(z.kapital), fmt(z.rest)],
      })), ["Summe", ...(mitDatum ? [""] : []), "", fmt(e.gesamt), fmt(e.zinsen), fmt(R.r2(e.gesamt - e.zinsen)), ""]);

      return {
        datei: "Leasingplan",
        eckdaten: [
          ["Leasingplan"], [],
          ["Kaufpreis", p.preis], ["Anzahlung (Maxirate)", p.anzahlung], ["Restwert (Kaufoption)", p.restwert],
          ["Zinssatz p.a. (%)", p.zins], ["Laufzeit (Monate)", p.monate], ["Rhythmus", RHYTHMUS[p.m]],
          ["Zahlung", p.vorschuessig ? "vorschüssig" : "nachschüssig"], ["Vertragsbeginn", p.start || ""], [],
          ["Leasingrate", e.rate], ["Anzahl Raten", e.anzahl], ["Finanzierter Betrag", e.finanziert],
          ["Zinsen gesamt", e.zinsen], ["Gesamtkosten", e.gesamt], ["Mehrkosten ggü. Kaufpreis", e.mehrkosten],
        ],
        plan: [["Nr.", "Datum", "Art", "Zahlung", "Zins", "Kapital", "Restschuld"],
          ...e.zeilen.map((z) => [z.art === "Rate" ? z.nr : "", z.datum || "", z.art, z.rate, z.zins, z.kapital, z.rest])],
      };
    },
  };

  // ---------- Excel ----------
  let xlsxLaden = null;
  function ladeXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (!xlsxLaden)
      xlsxLaden = new Promise((ok, nein) => {
        const s = document.createElement("script");
        s.src = XLSX_URL;
        s.onload = () => ok(window.XLSX);
        s.onerror = () => { xlsxLaden = null; nein(new Error("Excel-Baustein konnte nicht geladen werden.")); };
        document.head.appendChild(s);
      });
    return xlsxLaden;
  }
  function blatt(XLSX, daten, breiten) {
    const ws = XLSX.utils.aoa_to_sheet(daten, { cellDates: true });
    const bereich = XLSX.utils.decode_range(ws["!ref"]);
    for (let r = bereich.s.r; r <= bereich.e.r; r++)
      for (let c = bereich.s.c; c <= bereich.e.c; c++) {
        const zelle = ws[XLSX.utils.encode_cell({ r, c })];
        if (!zelle) continue;
        if (zelle.t === "d") zelle.z = "dd.mm.yyyy";
        else if (zelle.t === "n" && !Number.isInteger(zelle.v)) zelle.z = "#,##0.00";
        else if (zelle.t === "n" && c > 0 && Math.abs(zelle.v) >= 1000) zelle.z = "#,##0.00";
      }
    ws["!cols"] = breiten.map((w) => ({ wch: w }));
    return ws;
  }
  async function exportieren(sek) {
    const knopf = sek.querySelector("[data-export]");
    const daten = rechner[sek.id](sek);
    if (!daten) return;
    knopf.textContent = "…";
    try {
      const XLSX = await ladeXlsx();
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, blatt(XLSX, daten.eckdaten, [30, 18]), "Eckdaten");
      if (daten.jahre) XLSX.utils.book_append_sheet(wb, blatt(XLSX, daten.jahre, [8, 16, 14, 16]), "Je Jahr");
      XLSX.utils.book_append_sheet(wb, blatt(XLSX, daten.plan, [8, 12, 16, 14, 14, 14, 14, 16]), "Plan");
      XLSX.writeFile(wb, `${daten.datei}_${heute()}.xlsx`, { cellDates: true });
    } catch (err) {
      fehler(sek, err.message);
      setTimeout(() => berechne(sek), 4000);
    } finally {
      knopf.textContent = "Excel ↓";
    }
  }

  // ---------- Ablauf ----------
  function berechne(sek) {
    try { rechner[sek.id](sek); } catch (err) { fehler(sek, "Fehler bei der Berechnung: " + err.message); }
    speicher.schreiben(sek.id, felder(sek));
  }

  const sektionen = [...document.querySelectorAll("main > section")];
  sektionen.forEach((sek) => {
    setzeFelder(sek, speicher.lesen(sek.id));
    sek.querySelectorAll('input[type="date"]').forEach((el) => { if (!el.value) el.value = heute(); });
    let timer;
    const neu = () => { clearTimeout(timer); timer = setTimeout(() => berechne(sek), 150); };
    sek.addEventListener("input", neu);
    sek.addEventListener("change", neu);
    sek.querySelectorAll(".wahl").forEach((seg) =>
      seg.addEventListener("click", (ev) => {
        const b = ev.target.closest("button");
        if (!b) return;
        seg.querySelectorAll("button").forEach((x) => x.classList.toggle("an", x === b));
        neu();
      }));
    // Excel-Knopf sitzt in der Klapp-Zeile: Klick soll nicht zuklappen
    sek.querySelector("[data-export]").addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      exportieren(sek);
    });
    // Einklappbare Bereiche: Zustand merken
    sek.querySelectorAll("details[data-klapp]").forEach((d) => {
      const gemerkt = speicher.lesen("klapp_" + d.dataset.klapp);
      if (gemerkt !== null) d.open = gemerkt;
      d.addEventListener("toggle", () => speicher.schreiben("klapp_" + d.dataset.klapp, d.open));
    });
    berechne(sek);
  });

  function zeige(tab) {
    document.querySelectorAll("nav button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
    sektionen.forEach((s) => (s.hidden = s.id !== tab));
    passen(document.getElementById(tab));
    speicher.schreiben("tab", tab);
  }
  document.querySelector("nav").addEventListener("click", (ev) => {
    const b = ev.target.closest("button");
    if (b) zeige(b.dataset.tab);
  });
  zeige(speicher.lesen("tab") || "tilgung");
})();
