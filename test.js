// Prüft den Rechenkern: node test.js
const R = require("./calc.js");
const assert = require("assert");
const t = R.tilgungsplan({ betrag: 100000, zins: 4, m: 12, jahre: 20 });
assert.strictEqual(t.rate, 605.98);
assert.strictEqual(t.anzahl, 240);
assert.strictEqual(t.zeilen.at(-1).rest, 0);
const e = R.endwert({ rate: 200, zins: 3, m: 12, jahre: 10, startkapital: 5000 });
assert.ok(Math.abs(e.endwert - e.formel) < 0.05);
for (const v of [true, false]) {
  const l = R.leasing({ preis: 50000, anzahlung: 10000, restwert: 5000, zins: 5, m: 12, monate: 48, vorschuessig: v });
  assert.strictEqual(l.zeilen.at(-1).rest, 0);
  assert.strictEqual(R.r2(l.zeilen.reduce((a, z) => a + z.kapital, 0)), 50000);
}
console.log("alle Prüfungen bestanden");
