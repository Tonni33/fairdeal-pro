#!/usr/bin/env node
/**
 * Täyttää startsAt-kentän olemassa oleviin tapahtumiin.
 *
 *   node scripts/backfillStartsAt.js --dry-run
 *   node scripts/backfillStartsAt.js
 *
 * Jatkossa kenttää ylläpitää maintainEventStartsAt-triggeri, joten tämä on
 * kertaluontoinen. Käyttää samaa jäsennystä kuin funktiot (functions/eventDate.js),
 * jottei logiikka pääse eriytymään.
 */
const admin = require("firebase-admin");
const { eventDate } = require("../functions/eventDate");

const dryRun = process.argv.includes("--dry-run");

admin.initializeApp({
  credential: admin.credential.cert(
    require("../fairdeal-pro-firebase-adminsdk.json")
  ),
});

(async () => {
  const db = admin.firestore();
  const snapshot = await db.collection("events").get();

  let written = 0;
  let alreadyOk = 0;
  const unparsable = [];
  let batch = db.batch();
  let batched = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const when = eventDate(data);
    if (!when) {
      unparsable.push({ id: doc.id, date: data.date });
      continue;
    }
    const current = data.startsAt?.toDate ? data.startsAt.toDate() : null;
    if (current && Math.abs(current.getTime() - when.getTime()) < 1000) {
      alreadyOk += 1;
      continue;
    }
    written += 1;
    if (!dryRun) {
      batch.update(doc.ref, { startsAt: when });
      batched += 1;
      if (batched === 400) {
        await batch.commit();
        batch = db.batch();
        batched = 0;
      }
    }
  }
  if (!dryRun && batched > 0) {
    await batch.commit();
  }

  console.log(`tapahtumia:        ${snapshot.size}`);
  console.log(`${dryRun ? "kirjoitettaisiin:" : "kirjoitettu:      "} ${written}`);
  console.log(`jo ajan tasalla:   ${alreadyOk}`);
  console.log(`ei jäsenny:        ${unparsable.length}`);
  unparsable.slice(0, 5).forEach((e) => console.log(`   - ${e.id}: ${JSON.stringify(e.date)}`));
  process.exit(0);
})().catch((e) => {
  console.error("Täyttö epäonnistui:", e);
  process.exit(1);
});
