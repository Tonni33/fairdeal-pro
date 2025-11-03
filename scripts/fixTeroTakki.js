const admin = require("firebase-admin");
const serviceAccount = require("../fairdeal-pro-firebase-adminsdk.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function fixTeroTakki() {
  console.log("🔄 Fixing Tero Takki teams field...\n");

  // Hae Tero Takki
  const usersSnapshot = await db
    .collection("users")
    .where("email", "==", "tero.takki@example.com") // Vaihda oikea email
    .get();

  if (usersSnapshot.empty) {
    // Etsi nimellä jos email ei toimi
    const allUsers = await db.collection("users").get();
    const tero = allUsers.docs.find((doc) => {
      const data = doc.data();
      return (
        data.name &&
        data.name.toLowerCase().includes("tero") &&
        data.name.toLowerCase().includes("takki")
      );
    });

    if (!tero) {
      console.log("❌ Tero Takki not found");
      return;
    }

    await fixUser(tero);
  } else {
    await fixUser(usersSnapshot.docs[0]);
  }
}

async function fixUser(userDoc) {
  const data = userDoc.data();
  const teamIds = data.teamIds || [];

  console.log(`📋 Found: ${data.name || data.email}`);
  console.log(`   Current teamIds: ${JSON.stringify(teamIds)}`);
  console.log(`   Current teams: ${JSON.stringify(data.teams || [])}`);

  if (teamIds.length === 0) {
    console.log("   No teams to fix");
    return;
  }

  // Hae joukkueiden nimet
  const teamNames = [];
  for (const teamId of teamIds) {
    const teamDoc = await db.collection("teams").doc(teamId).get();
    if (teamDoc.exists()) {
      teamNames.push(teamDoc.data().name);
    }
  }

  console.log(`   Should be: ${JSON.stringify(teamNames)}`);

  // Päivitä
  await db.collection("users").doc(userDoc.id).update({
    teams: teamNames,
    updatedAt: new Date(),
  });

  console.log("   ✅ Updated!");
}

fixTeroTakki()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
