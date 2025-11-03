const admin = require("firebase-admin");
const serviceAccount = require("../fairdeal-pro-firebase-adminsdk.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function checkTeamsField() {
  console.log("🔍 Checking teams field consistency...\n");

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

  let correctTeams = 0;
  let incorrectTeams = 0;
  const incorrectUsers = [];

  usersSnapshot.docs.forEach((doc) => {
    const data = doc.data();
    const teamIds = data.teamIds || [];
    const teams = data.teams || [];

    if (teamIds.length === 0) return; // Skip users without teams

    // Tarkista onko teams-kentässä oikeita nimiä vai ID:itä
    let hasIncorrectData = false;

    teams.forEach((teamEntry) => {
      // Jos teams-kentässä on ID eikä nimi, se on väärin
      if (Object.keys(teamIdToName).includes(teamEntry)) {
        hasIncorrectData = true;
      }
    });

    // Tarkista myös että kaikki teamIds:n mukaiset joukkueet on teams-listassa
    const expectedTeamNames = teamIds
      .map((id) => teamIdToName[id])
      .filter(Boolean);
    const hasAllNames = expectedTeamNames.every((name) => teams.includes(name));
    const hasOnlyCorrectNames = teams.every((name) =>
      expectedTeamNames.includes(name)
    );

    if (hasIncorrectData || !hasAllNames || !hasOnlyCorrectNames) {
      incorrectTeams++;
      incorrectUsers.push({
        id: doc.id,
        name: data.name || data.email,
        teamIds: teamIds,
        teams: teams,
        expectedTeams: expectedTeamNames,
      });
    } else {
      correctTeams++;
    }
  });

  console.log("📊 Summary:");
  console.log(`   ✅ Correct: ${correctTeams}`);
  console.log(`   ❌ Incorrect: ${incorrectTeams}`);
  console.log("");

  if (incorrectUsers.length > 0) {
    console.log("❌ Users with incorrect teams field:");
    incorrectUsers.forEach((user) => {
      console.log(`\n   ${user.name}:`);
      console.log(`      teamIds: ${JSON.stringify(user.teamIds)}`);
      console.log(`      teams (current): ${JSON.stringify(user.teams)}`);
      console.log(
        `      teams (expected): ${JSON.stringify(user.expectedTeams)}`
      );
    });
  }

  return { incorrectUsers, teamIdToName };
}

checkTeamsField()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
