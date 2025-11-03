const admin = require("firebase-admin");
const serviceAccount = require("../fairdeal-pro-firebase-adminsdk.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function checkTeamsMembers() {
  const teamsSnapshot = await db.collection("teams").get();

  console.log("📋 Teams and their members arrays:\n");

  teamsSnapshot.docs.forEach((doc) => {
    const data = doc.data();
    console.log(`Team: ${data.name} (${doc.id})`);
    console.log(`  members array: ${data.members?.length || 0} members`);
    if (data.members && data.members.length > 0) {
      console.log(`  members:`, data.members);
    }
    console.log("");
  });

  // Erityisesti Kuntokiekkoilijat
  const kuntokiekko = teamsSnapshot.docs.find(
    (doc) =>
      doc.data().name && doc.data().name.toLowerCase().includes("kuntokiekko")
  );

  if (kuntokiekko) {
    const data = kuntokiekko.data();
    console.log("🎯 Kuntokiekkoilijat members array:");
    console.log("  Team ID:", kuntokiekko.id);
    console.log("  Members count:", data.members?.length || 0);
    console.log("  Members:", data.members);

    // Tarkista onko members array oikea määrä
    if (data.members && data.members.length > 5) {
      console.log(
        "\n✅ Members array has more than 5 members - migration might have lost data!"
      );
      console.log("  We should sync these members to user teamIds");
    }
  }
}

checkTeamsMembers()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
