// Kääntää "Sukunimi Etunimi" -muotoiset nimet muotoon "Etunimi Sukunimi",
// jotta sukunimen mukainen lajittelu (viimeinen sana) toimii kaikkialla.
// Käyttö: node scripts/normalizeNames.js --dry-run, sitten ilman lippua.
// Vanhat nimet tallennetaan scripts/name-swap-backup-<pvm>.json-tiedostoon.
const fs = require("fs");
const admin = require("../functions/node_modules/firebase-admin");
admin.initializeApp({ credential: admin.credential.cert(require("../fairdeal-pro-firebase-adminsdk.json")) });
const DRY = process.argv.includes("--dry-run");
const FIRST = new Set(`Pekka Aleksi Anssi Antti Ari Arto Atte Janne Heikki Dominik Eemeli Eino Erno Esko Hannu Harri Pena Henri Henrik Herbert Kimmo Ilkka Jan Jani Jari Jarkko Jarmo Jens Jesse Joel Johannes Joni Jonne Joona Joonas Jouni Juha Juha-Matti Juhani Juho Jukka Juri Jussi Juuso Jyrki Mauri Kalle Kimi Martti Kristian Osmo Erkki Pauli Lauri Jorma Markku Marko Markus Matti Miikka Mika Miki Mikko Niilo Niina Niki Niko Olli Oskari Ossi Otto Pasi Patrik Peetu Pentti Aimo Pete Petri Veli-Matti Milla Kari Reijo Riki Risto Rami Sakari Sakke Saku Sami Riku Santeri Sebastian Seppo Tapani Teemu Tero Topi Timo Tomi Tommi Toni Tony Tuomas Tuukka Vesa Ville Esa Vikke`.split(/\s+/).map((s) => s.toLowerCase()));
(async () => {
  const db = admin.firestore();
  const snap = await db.collection("users").get();
  const changes = [];
  snap.forEach((d) => {
    const x = d.data();
    const raw = (x.name || "").trim();
    const parts = raw.replace(",", "").split(/\s+/);
    if (parts.length !== 2) return;
    const [a, b] = parts.map((p) => p.toLowerCase());
    if (FIRST.has(a) || !FIRST.has(b)) return;
    const next = `${parts[1]} ${parts[0]}`;
    const update = { name: next };
    if ((x.displayName || "") === (x.name || "")) update.displayName = next;
    changes.push({ id: d.id, before: { name: x.name, displayName: x.displayName ?? null }, update });
  });
  console.log(`${changes.length} muutosta${DRY ? " (kuivaharjoitus)" : ""}`);
  changes.forEach((c) => console.log(`  ${c.before.name}  ->  ${c.update.name}${c.update.displayName ? "" : "   (displayName ennallaan: " + c.before.displayName + ")"}`));
  if (DRY) process.exit(0);
  const backup = require("path").join(__dirname, `name-swap-backup-${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(backup, JSON.stringify(changes, null, 2));
  console.log("varmuuskopio:", backup);
  const batch = db.batch();
  changes.forEach((c) => batch.update(db.collection("users").doc(c.id), c.update));
  await batch.commit();
  console.log("kirjoitettu", changes.length);
  process.exit(0);
})();
