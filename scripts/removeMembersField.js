const admin = require("firebase-admin");
const serviceAccount = require("../fairdeal-pro-firebase-adminsdk.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

async function removeMembersField() {
  console.log("🔄 Removing members field from all teams...\n");

  // Hae kaikki joukkueet
  const teamsSnapshot = await db.collection("teams").get();

  console.log(`📋 Found ${teamsSnapshot.docs.length} teams\n`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const doc of teamsSnapshot.docs) {
    const data = doc.data();

    // Tarkista onko members-kenttä olemassa
    if (!data.members) {
      console.log(`⏭️  ${data.name}: No members field, skipping`);
      skipped++;
      continue;
    }

    try {
      // Poista members-kenttä
      await db.collection("teams").doc(doc.id).update({
        members: FieldValue.delete(),
        updatedAt: new Date(),
      });

      console.log(
        `✅ ${data.name}: Removed members field (had ${data.members.length} members)`
      );
      updated++;
    } catch (error) {
      console.error(`❌ Error updating ${data.name}:`, error.message);
      errors++;
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("✅ MEMBERS FIELD REMOVAL COMPLETE");
  console.log("=".repeat(60));
  console.log(`📊 Summary:`);
  console.log(`   - Updated (removed members): ${updated}`);
  console.log(`   - Skipped (no members field): ${skipped}`);
  console.log(`   - Errors: ${errors}`);
  console.log("=".repeat(60));

  console.log("\n⚠️  IMPORTANT: This is a destructive operation!");
  console.log(
    "   Make sure your code no longer uses team.members before running this."
  );
  console.log(
    "   After this, only player.teamIds will be used for team membership."
  );
}

// Turvallisuustarkistus - vaadi vahvistus
const confirmText = process.argv[2];
if (confirmText !== "CONFIRM") {
  console.log(
    "⚠️  SAFETY CHECK: This will permanently remove the members field from all teams!"
  );
  console.log("");
  console.log("To proceed, run:");
  console.log("  node scripts/removeMembersField.js CONFIRM");
  console.log("");
  process.exit(0);
}

removeMembersField()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
