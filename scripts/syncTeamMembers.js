const { initializeApp } = require("firebase/app");
const {
  getFirestore,
  collection,
  getDocs,
  doc,
  updateDoc,
  arrayUnion,
} = require("firebase/firestore");

// Firebase configuration (same as in your project)
const firebaseConfig = {
  // Add your config here
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function syncTeamMembers() {
  try {
    console.log("Starting team member synchronization...");

    // Get all users
    const usersSnapshot = await getDocs(collection(db, "users"));
    const users = usersSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Get all teams
    const teamsSnapshot = await getDocs(collection(db, "teams"));
    const teams = teamsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    console.log(`Found ${users.length} users and ${teams.length} teams`);

    let updatedTeams = 0;
    let addedMembers = 0;

    // For each user with teamIds
    for (const user of users) {
      if (user.teamIds && Array.isArray(user.teamIds)) {
        console.log(
          `Processing user ${user.email || user.name} with teams:`,
          user.teamIds
        );

        // For each team the user belongs to
        for (const teamId of user.teamIds) {
          const team = teams.find((t) => t.id === teamId);
          if (!team) {
            console.log(
              `Team ${teamId} not found for user ${user.email || user.name}`
            );
            continue;
          }

          // Check if user is already in team's members array
          const members = team.members || [];
          if (!members.includes(user.id)) {
            console.log(
              `Adding user ${user.email || user.name} to team ${team.name}`
            );

            // Add user to team's members
            const teamRef = doc(db, "teams", teamId);
            await updateDoc(teamRef, {
              members: arrayUnion(user.id),
            });

            addedMembers++;

            // Update local team data for next iterations
            team.members = [...members, user.id];
          } else {
            console.log(
              `User ${user.email || user.name} already in team ${team.name}`
            );
          }
        }
      }
    }

    console.log(`\nSynchronization completed!`);
    console.log(`- Updated teams: ${updatedTeams}`);
    console.log(`- Added member relationships: ${addedMembers}`);
  } catch (error) {
    console.error("Error synchronizing team members:", error);
  }
}

// Run the sync
syncTeamMembers()
  .then(() => {
    console.log("Script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });
