const admin = require("firebase-admin");
const serviceAccount = require("../fairdeal-pro-firebase-adminsdk.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function fixTeamsField() {
  console.log("🔄 Fixing teams field to use team names instead of IDs...\n");

  // Hae kaikki joukkueet ja luo ID->nimi mapping
  const teamsSnapshot = await db.collection("teams").get();
  const teamIdToName = {};
  teamsSnapshot.docs.forEach((doc) => {
    teamIdToName[doc.id] = doc.data().name;
  });

  console.log("📋 Teams mapping:");
  Object.entries(teamIdToName).forEach(([id, name]) => {
    console.log(`   ${id} → ${name}`);
  });
  console.log("");

  // Hae kaikki käyttäjät
  const usersSnapshot = await db.collection("users").get();

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const doc of usersSnapshot.docs) {
    const data = doc.data();
    const teamIds = data.teamIds || [];
    const currentTeams = data.teams || [];

    if (teamIds.length === 0) {
      skipped++;
      continue; // Skip users without teams
    }

    // Laske oikeat joukkueiden nimet teamIds:n perusteella
    const correctTeamNames = teamIds
      .map((id) => teamIdToName[id])
      .filter(Boolean);

    // Tarkista onko teams-kenttä jo oikein
    const isCorrect =
      correctTeamNames.length === currentTeams.length &&
      correctTeamNames.every((name) => currentTeams.includes(name)) &&
      currentTeams.every((name) => correctTeamNames.includes(name));

    if (isCorrect) {
      skipped++;
      continue;
    }

    // Päivitä teams-kenttä oikeilla nimillä
    try {
      await db.collection("users").doc(doc.id).update({
        teams: correctTeamNames,
        updatedAt: new Date(),
      });

      console.log(`✅ ${data.name || data.email}:`);
      console.log(`   Before: ${JSON.stringify(currentTeams)}`);
      console.log(`   After:  ${JSON.stringify(correctTeamNames)}`);
      updated++;
    } catch (error) {
      console.error(
        `❌ Error updating ${data.name || data.email}:`,
        error.message
      );
      errors++;
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("✅ TEAMS FIELD FIX COMPLETE");
  console.log("=".repeat(60));
  console.log(`📊 Summary:`);
  console.log(`   - Updated: ${updated}`);
  console.log(`   - Skipped (already correct): ${skipped}`);
  console.log(`   - Errors: ${errors}`);
  console.log("=".repeat(60));
}

fixTeamsField()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
