/* Finanzrechner – Rechenkern (ohne Oberfläche, auch in Node testbar).
   Zins je Periode relativ: i = Jahreszins / Perioden pro Jahr.
   Beträge auf Cent gerundet, Rundungsrest in der letzten Rate. */
(function (root) {
  "use strict";

  const r2 = (x) => Math.round((x + Math.sign(x) * 1e-9) * 100) / 100;

  // Gleichbleibende Rate (nachschüssig) für Betrag k über n Perioden
  function annuitaet(k, i, n) {
    if (n <= 0) return k;
    if (i === 0) return k / n;
    return (k * i) / (1 - Math.pow(1 + i, -n));
  }

  function addMonate(d, monate) {
    if (!d) return null;
    const t = new Date(d.getFullYear(), d.getMonth() + monate, 1);
    const letzter = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
    t.setDate(Math.min(d.getDate(), letzter));
    return t;
  }

  /* Französischer Tilgungsplan
     p: { betrag, zins (% p.a.), m (Raten/Jahr), jahre, start (Date|null),
          vorPerioden, sonderNr, sonderBetrag, sonderModus: "rate"|"laufzeit" } */
  function tilgungsplan(p) {
    const i = p.zins / 100 / p.m;
    const n = Math.round(p.jahre * p.m);
    const schritt = 12 / p.m;
    const vor = Math.max(0, Math.round(p.vorPerioden || 0));
    const sNr = Math.round(p.sonderNr || 0);
    const sBetrag = p.sonderBetrag || 0;
    const zeilen = [];
    let rest = r2(p.betrag);
    let t = 0;

    const sonder = (zeile) => {
      if (sBetrag > 0 && t === sNr && rest > 0) {
        const s = r2(Math.min(sBetrag, rest));
        rest = r2(rest - s);
        zeile.sonder = s;
        zeile.rest = rest;
        return true;
      }
      return false;
    };

    // Vorfinanzierung: nur Zinsen
    for (let k = 0; k < vor; k++) {
      t++;
      const z = r2(rest * i);
      const zeile = { nr: t, datum: addMonate(p.start, t * schritt), art: "Vorfinanzierung",
        rate: z, zins: z, tilgung: 0, sonder: 0, rest };
      sonder(zeile);
      zeilen.push(zeile);
    }

    let rate = r2(annuitaet(rest, i, n));
    const rateAnfang = rate;
    let offen = n;
    let schutz = 0;
    while (rest > 0.004 && schutz++ < 10000) {
      t++;
      offen--;
      const z = r2(rest * i);
      let tilg, zahlung;
      if (offen <= 0 || rest + z <= rate) {
        tilg = rest;
        zahlung = r2(z + rest);
      } else {
        tilg = r2(rate - z);
        zahlung = rate;
      }
      rest = r2(rest - tilg);
      const zeile = { nr: t, datum: addMonate(p.start, t * schritt), art: "Tilgung",
        rate: zahlung, zins: z, tilgung: tilg, sonder: 0, rest };
      if (sonder(zeile) && rest > 0 && p.sonderModus === "rate") {
        rate = r2(annuitaet(rest, i, Math.max(offen, 1)));
        zeile.neueRate = rate;
      }
      zeilen.push(zeile);
    }

    const summe = (f) => r2(zeilen.reduce((a, z) => a + z[f], 0));
    return {
      zeilen,
      rate: rateAnfang,
      rateNeu: rate !== rateAnfang ? rate : null,
      zinsen: summe("zins"),
      sonder: summe("sonder"),
      gesamt: r2(summe("rate") + summe("sonder")),
      anzahl: zeilen.length,
      ende: zeilen.length ? zeilen[zeilen.length - 1].datum : null,
    };
  }

  /* Endwert periodischer Einzahlungen (nachschüssig)
     p: { rate, zins (% p.a.), m, jahre, startkapital } */
  function endwert(p) {
    const i = p.zins / 100 / p.m;
    const n = Math.round(p.jahre * p.m);
    let stand = r2(p.startkapital || 0);
    const perioden = [];
    const jahre = [];
    let jahr = null;
    for (let t = 1; t <= n; t++) {
      const z = r2(stand * i);
      stand = r2(stand + z + p.rate);
      perioden.push({ nr: t, einzahlung: p.rate, zins: z, stand });
      const j = Math.ceil(t / p.m);
      if (!jahr || jahr.jahr !== j) {
        jahr = { jahr: j, einzahlung: 0, zins: 0, stand: 0 };
        jahre.push(jahr);
      }
      jahr.einzahlung = r2(jahr.einzahlung + p.rate);
      jahr.zins = r2(jahr.zins + z);
      jahr.stand = stand;
    }
    const einzahlungen = r2((p.startkapital || 0) + p.rate * n);
    // Formelwert zur Kontrolle (ungerundet)
    const q = Math.pow(1 + i, n);
    const formel = (p.startkapital || 0) * q + (i === 0 ? p.rate * n : (p.rate * (q - 1)) / i);
    return { perioden, jahre, endwert: n ? stand : r2(p.startkapital || 0),
      einzahlungen, zinsen: r2((n ? stand : einzahlungen) - einzahlungen), formel, anzahl: n };
  }

  /* Leasingplan – Rate aus Zins
     p: { preis, anzahlung, restwert, zins (% p.a.), m, monate, start, vorschuessig } */
  function leasing(p) {
    const i = p.zins / 100 / p.m;
    const schritt = 12 / p.m;
    const n = Math.round(p.monate / schritt);
    const finanziert = r2(p.preis - p.anzahlung);
    const v = Math.pow(1 + i, -n);
    const barwertRest = p.restwert * v;
    let rateRoh;
    if (i === 0) rateRoh = (finanziert - p.restwert) / n;
    else {
      rateRoh = ((finanziert - barwertRest) * i) / (1 - v);
      if (p.vorschuessig) rateRoh /= 1 + i;
    }
    const rate = r2(rateRoh);
    const zeilen = [];
    if (p.anzahlung > 0)
      zeilen.push({ nr: 0, datum: p.start, art: "Anzahlung", rate: r2(p.anzahlung), zins: 0,
        kapital: r2(p.anzahlung), rest: finanziert });

    let rest = finanziert;
    for (let k = 1; k <= n; k++) {
      const datum = addMonate(p.start, (p.vorschuessig ? k - 1 : k) * schritt);
      const z = p.vorschuessig && k === 1 ? 0 : r2(rest * i);
      let kap, zahlung;
      if (k === n) {
        // letzte Rate gleicht Rundung aus, damit der Restwert genau stimmt
        kap = p.vorschuessig ? r2(rest - p.restwert / (1 + i)) : r2(rest - p.restwert);
        zahlung = r2(z + kap);
      } else {
        kap = r2(rate - z);
        zahlung = rate;
      }
      rest = r2(rest - kap);
      zeilen.push({ nr: k, datum, art: "Rate", rate: zahlung, zins: z, kapital: kap, rest });
    }
    if (p.restwert > 0) {
      const z = p.vorschuessig ? r2(p.restwert - rest) : 0;
      zeilen.push({ nr: n + 1, datum: addMonate(p.start, n * schritt), art: "Kaufoption",
        rate: r2(p.restwert), zins: z, kapital: rest, rest: 0 });
      rest = 0;
    }
    const summe = (f) => r2(zeilen.reduce((a, z) => a + z[f], 0));
    const raten = r2(zeilen.filter((z) => z.art === "Rate").reduce((a, z) => a + z.rate, 0));
    const gesamt = summe("rate");
    return { zeilen, rate, anzahl: n, finanziert, zinsen: summe("zins"), raten, gesamt,
      mehrkosten: r2(gesamt - p.preis) };
  }

  const api = { r2, annuitaet, addMonate, tilgungsplan, endwert, leasing };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Rechner = api;
})(this);
