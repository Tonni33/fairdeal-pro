const admin = require("firebase-admin");
const serviceAccount = require("../fairdeal-pro-firebase-adminsdk.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function listAllUsers() {
  const usersSnapshot = await db.collection("users").get();

  console.log(`📊 Total users in database: ${usersSnapshot.docs.length}\n`);

  const users = usersSnapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      name: data.name || "N/A",
      email: data.email || "N/A",
      teamIds: data.teamIds || [],
      teams: data.teams || [],
      position: data.position || "N/A",
    };
  });

  // Ryhmittele joukkueiden mukaan
  const byTeam = {};
  users.forEach((user) => {
    if (user.teamIds.length === 0) {
      if (!byTeam["NO_TEAM"]) byTeam["NO_TEAM"] = [];
      byTeam["NO_TEAM"].push(user);
    } else {
      user.teamIds.forEach((teamId) => {
        if (!byTeam[teamId]) byTeam[teamId] = [];
        byTeam[teamId].push(user);
      });
    }
  });

  // Hae joukkueiden nimet
  const teamsSnapshot = await db.collection("teams").get();
  const teamNames = {};
  teamsSnapshot.docs.forEach((doc) => {
    teamNames[doc.id] = doc.data().name;
  });

  console.log("👥 Users by team:\n");
  Object.keys(byTeam)
    .sort()
    .forEach((teamId) => {
      const teamName = teamNames[teamId] || teamId;
      console.log(`📋 ${teamName} (${byTeam[teamId].length} players):`);
      byTeam[teamId].forEach((user) => {
        console.log(`   - ${user.name} (${user.email}) - ${user.position}`);
      });
      console.log("");
    });
}

listAllUsers()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
