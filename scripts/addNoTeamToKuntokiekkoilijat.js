const admin = require("firebase-admin");
const serviceAccount = require("../fairdeal-pro-firebase-adminsdk.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const KUNTOKIEKKOILIJAT_ID = "R74jLK29jt8jGuQJvG9g";

async function addNoTeamPlayersToKuntokiekkoilijat() {
  console.log("🔄 Adding NO_TEAM players to Kuntokiekkoilijat...\n");

  // Hae kaikki käyttäjät
  const usersSnapshot = await db.collection("users").get();

  // Suodata pelaajat joilla ei ole yhtään joukkuetta
  const noTeamPlayers = usersSnapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((player) => !player.teamIds || player.teamIds.length === 0);

  console.log(`📊 Found ${noTeamPlayers.length} players without team\n`);

  if (noTeamPlayers.length === 0) {
    console.log("✅ No players to add");
    return;
  }

  console.log("👥 Players to add:");
  noTeamPlayers.forEach((p) => {
    console.log(`   - ${p.name || p.email}`);
  });
  console.log("");

  let updated = 0;
  let errors = 0;

  // Päivitä jokainen pelaaja
  for (const player of noTeamPlayers) {
    try {
      const userRef = db.collection("users").doc(player.id);

      await userRef.update({
        teamIds: [KUNTOKIEKKOILIJAT_ID],
        teams: ["Kuntokiekkoilijat"],
        updatedAt: new Date(),
      });

      console.log(
        `✅ Added ${player.name || player.email} to Kuntokiekkoilijat`
      );
      updated++;
    } catch (error) {
      console.error(
        `❌ Error updating ${player.name || player.email}:`,
        error.message
      );
      errors++;
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("✅ BATCH UPDATE COMPLETE");
  console.log("=".repeat(60));
  console.log(`📊 Summary:`);
  console.log(`   - Players updated: ${updated}`);
  console.log(`   - Errors: ${errors}`);
  console.log("=".repeat(60));

  // Näytä lopputilanne
  console.log("\n📋 Verifying...");
  const updatedSnapshot = await db.collection("users").get();
  const kuntokiekkoilijatPlayers = updatedSnapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((p) => p.teamIds && p.teamIds.includes(KUNTOKIEKKOILIJAT_ID));

  console.log(
    `\n✅ Kuntokiekkoilijat now has ${kuntokiekkoilijatPlayers.length} players`
  );
}

addNoTeamPlayersToKuntokiekkoilijat()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
