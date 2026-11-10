# Finanzrechner

Webapp für GitHub Pages (`https://dilitzd.github.io/finanzrechner/`), fürs iPhone optimiert, im Design der Widgets.

## Rechner
- **Französischer Tilgungsplan** – gleichbleibende Rate; Rhythmus, Vorfinanzierung (nur Zinsen, in Perioden), Sondertilgung (Rate senken oder Laufzeit kürzen).
- **Endwert periodischer Einzahlungen** – nachschüssig, Rhythmus wählbar, Startkapital.
- **Leasingplan** – Rate aus Zins; Anzahlung (Maxirate) und Restwert (Kaufoption) in € oder %, vorschüssig/nachschüssig, Aufteilung Zins/Kapital.

## Rechenregeln
- Zins je Periode relativ: Jahreszins ÷ Raten pro Jahr.
- Beträge auf Cent gerundet, Rundungsrest in der letzten Rate.
- Export als Excel (.xlsx) über SheetJS 0.18.5 (`xlsx.full.min.js`, Apache-2.0, wird erst beim Export geladen).

## Dateien
| Datei | Inhalt |
|---|---|
| `index.html` | Seite und Gestaltung |
| `calc.js` | Rechenkern (in Node testbar: `node test.js`) |
| `app.js` | Eingaben, Anzeige, Excel-Export |
| `manifest.webmanifest`, `icon-*.png` | Homescreen-App |

## Neue Fassung veröffentlichen
Bei jeder Änderung an `calc.js`/`app.js` die Nummer `?v=` in `index.html` erhöhen, sonst lädt das iPhone das alte Skript aus dem Zwischenspeicher.

## Zum Homescreen
Safari → Teilen → „Zum Home-Bildschirm“.
