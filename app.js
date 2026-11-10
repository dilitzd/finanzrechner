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
      if (el.classList.contains("segment")) o[f] = el.querySelector(".an").dataset.v;
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
      if (el.classList.contains("segment"))
        el.querySelectorAll("button").forEach((b) => b.classList.toggle("an", b.dataset.v === o[f]));
      else if (el.type === "checkbox") el.checked = !!o[f];
      else el.value = o[f];
    });
  }

  // ---------- Darstellung ----------
  function werte(sek, liste) {
    sek.querySelector("[data-ergebnis]").innerHTML = liste
      .map((w) => `<div class="wert${w.akzent ? " akzent" : ""}"><div class="name">${w.name}</div>` +
        `<div class="zahl">${w.zahl}</div>${w.zusatz ? `<div class="zusatz">${w.zusatz}</div>` : ""}</div>`)
      .join("");
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
      knopf.textContent = "Excel";
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
    sek.querySelectorAll(".segment").forEach((seg) =>
      seg.addEventListener("click", (ev) => {
        const b = ev.target.closest("button");
        if (!b) return;
        seg.querySelectorAll("button").forEach((x) => x.classList.toggle("an", x === b));
        neu();
      }));
    sek.querySelector("[data-export]").addEventListener("click", () => exportieren(sek));
    berechne(sek);
  });

  function zeige(tab) {
    document.querySelectorAll("nav button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
    sektionen.forEach((s) => (s.hidden = s.id !== tab));
    document.getElementById("rubrik").textContent = document.getElementById(tab).dataset.titel;
    speicher.schreiben("tab", tab);
  }
  document.querySelector("nav").addEventListener("click", (ev) => {
    const b = ev.target.closest("button");
    if (b) zeige(b.dataset.tab);
  });
  zeige(speicher.lesen("tab") || "tilgung");
})();
