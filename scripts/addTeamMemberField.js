const admin = require("firebase-admin");
const serviceAccount = require("../fairdeal-pro-firebase-adminsdk.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function addTeamMemberField() {
  console.log("🔄 Adding teamMember field to all users...\n");

  try {
    // Hae kaikki käyttäjät
    const usersSnapshot = await db.collection("users").get();
    const users = usersSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    console.log(`📋 Found ${users.length} users\n`);

    let updatedCount = 0;
    let skippedCount = 0;
    let errors = 0;

    for (const user of users) {
      try {
        // Jos teamMember kenttä on jo olemassa, ohita
        if (user.teamMember) {
          console.log(`⏭️  ${user.name} - teamMember already exists, skipping`);
          skippedCount++;
          continue;
        }

        // Luo teamMember objekti käyttäjän teamIds-arrayn perusteella
        const teamMember = {};

        if (user.teamIds && Array.isArray(user.teamIds)) {
          // Aseta true kaikille käyttäjän joukkueille
          user.teamIds.forEach((teamId) => {
            teamMember[teamId] = true;
          });
        }

        // Päivitä käyttäjä
        await db.collection("users").doc(user.id).update({
          teamMember: teamMember,
        });

        const teamCount = Object.keys(teamMember).length;
        console.log(
          `✅ ${user.name} - Added teamMember for ${teamCount} team(s): ${
            user.teams?.join(", ") || "N/A"
          }`
        );
        updatedCount++;
      } catch (error) {
        console.error(`❌ Error updating user ${user.name}:`, error.message);
        errors++;
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("📊 Summary:");
    console.log(`   ✅ Updated: ${updatedCount}`);
    console.log(`   ⏭️  Skipped (already had field): ${skippedCount}`);
    console.log(`   ❌ Errors: ${errors}`);
    console.log(`   📋 Total: ${users.length}`);
    console.log("=".repeat(60) + "\n");

    if (errors === 0) {
      console.log("✨ All users updated successfully!\n");
    } else {
      console.log("⚠️  Some errors occurred. Check the logs above.\n");
    }
  } catch (error) {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  }

  process.exit(0);
}

addTeamMemberField();
