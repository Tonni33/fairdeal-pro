const admin = require("firebase-admin");
const serviceAccount = require("../fairdeal-pro-firebase-adminsdk.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function checkTeam() {
  // Hae Kuntokiekkoilijat joukkue
  const teamsSnapshot = await db.collection("teams").get();
  const kuntokiekkoilijat = teamsSnapshot.docs.find(
    (doc) =>
      doc.data().name && doc.data().name.toLowerCase().includes("kuntokiekko")
  );

  if (!kuntokiekkoilijat) {
    console.log("❌ Kuntokiekkoilijat joukkuetta ei löytynyt");
    return;
  }

  const teamData = kuntokiekkoilijat.data();
  console.log("📋 Kuntokiekkoilijat:");
  console.log("   ID:", kuntokiekkoilijat.id);
  console.log("   Name:", teamData.name);
  console.log("   members array:", teamData.members?.length || 0);

  // Hae pelaajat joilla on tämä teamId
  const usersSnapshot = await db.collection("users").get();
  const players = usersSnapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((p) => p.teamIds && p.teamIds.includes(kuntokiekkoilijat.id));

  console.log("   Players with teamId:", players.length);
  console.log("");
  console.log("🎯 Players:");
  players.forEach((p) => {
    console.log(
      "   -",
      p.name || p.email,
      "(position:",
      p.position || "N/A",
      ")"
    );
  });
}

checkTeam()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
