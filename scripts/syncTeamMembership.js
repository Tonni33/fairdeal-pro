/**
 * Sync Team Membership Script
 *
 * This script ensures bidirectional sync between:
 * - teams.members[] (team → players)
 * - users.teamIds[] (players → teams)
 *
 * It will:
 * 1. Read all teams and their members
 * 2. Update each user's teamIds array to match team memberships
 * 3. Remove teamIds that no longer exist in any team
 * 4. Keep teams array in sync with teamIds
 */

const admin = require("firebase-admin");
const path = require("path");

// Initialize Firebase Admin
const serviceAccount = require(path.join(
  __dirname,
  "../fairdeal-pro-firebase-adminsdk.json"
));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

async function syncTeamMembership() {
  console.log("🔄 Starting team membership synchronization...\n");

  try {
    // Step 1: Fetch all teams
    console.log("📋 Step 1: Fetching all teams...");
    const teamsSnapshot = await db.collection("teams").get();
    const teams = [];

    teamsSnapshot.forEach((doc) => {
      teams.push({
        id: doc.id,
        name: doc.data().name,
        members: doc.data().members || [],
      });
    });

    console.log(`✅ Found ${teams.length} teams\n`);

    // Step 2: Build a map of userId -> teamIds
    console.log("📋 Step 2: Building user-to-teams mapping...");
    const userTeamMap = new Map(); // userId -> Set of teamIds

    teams.forEach((team) => {
      team.members.forEach((memberId) => {
        if (!userTeamMap.has(memberId)) {
          userTeamMap.set(memberId, new Set());
        }
        userTeamMap.get(memberId).add(team.id);
      });
    });

    console.log(`✅ Mapped ${userTeamMap.size} users to their teams\n`);

    // Step 3: Fetch all users
    console.log("📋 Step 3: Fetching all users...");
    const usersSnapshot = await db.collection("users").get();
    console.log(`✅ Found ${usersSnapshot.size} users\n`);

    // Step 4: Update each user's teamIds and teams
    console.log("📋 Step 4: Updating user documents...\n");
    let updatedCount = 0;
    let unchangedCount = 0;
    let errorCount = 0;

    const batch = db.batch();
    let batchCount = 0;
    const BATCH_SIZE = 500;

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();
      const currentTeamIds = userData.teamIds || [];

      // Get the correct teamIds from our map
      const correctTeamIds = userTeamMap.has(userId)
        ? Array.from(userTeamMap.get(userId))
        : [];

      // Check if update is needed
      const needsUpdate =
        JSON.stringify(currentTeamIds.sort()) !==
        JSON.stringify(correctTeamIds.sort());

      if (needsUpdate) {
        try {
          const userRef = db.collection("users").doc(userId);

          batch.update(userRef, {
            teamIds: correctTeamIds,
            teams: correctTeamIds, // Keep teams in sync with teamIds
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          batchCount++;
          updatedCount++;

          console.log(
            `✏️  Updated: ${userData.name || userData.email || userId}`
          );
          console.log(`   Old teamIds: [${currentTeamIds.join(", ")}]`);
          console.log(`   New teamIds: [${correctTeamIds.join(", ")}]`);

          // Get team names for better readability
          const teamNames = correctTeamIds.map((teamId) => {
            const team = teams.find((t) => t.id === teamId);
            return team ? team.name : teamId;
          });
          console.log(`   Teams: ${teamNames.join(", ")}\n`);

          // Commit batch if it reaches BATCH_SIZE
          if (batchCount >= BATCH_SIZE) {
            await batch.commit();
            console.log(`💾 Committed batch of ${batchCount} updates\n`);
            batchCount = 0;
          }
        } catch (error) {
          errorCount++;
          console.error(`❌ Error updating user ${userId}:`, error.message);
        }
      } else {
        unchangedCount++;
      }
    }

    // Commit remaining updates
    if (batchCount > 0) {
      await batch.commit();
      console.log(`💾 Committed final batch of ${batchCount} updates\n`);
    }

    // Step 5: Summary
    console.log("\n" + "=".repeat(60));
    console.log("✅ SYNCHRONIZATION COMPLETE");
    console.log("=".repeat(60));
    console.log(`📊 Summary:`);
    console.log(`   - Total users: ${usersSnapshot.size}`);
    console.log(`   - Updated: ${updatedCount}`);
    console.log(`   - Unchanged: ${unchangedCount}`);
    console.log(`   - Errors: ${errorCount}`);
    console.log("=".repeat(60) + "\n");

    // Step 6: Verification
    console.log("📋 Step 5: Verifying sync...\n");

    let verificationErrors = 0;

    // Check: Every team member should have that teamId
    for (const team of teams) {
      for (const memberId of team.members) {
        const userDoc = await db.collection("users").doc(memberId).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          const userTeamIds = userData.teamIds || [];

          if (!userTeamIds.includes(team.id)) {
            console.error(
              `❌ Verification error: User ${
                userData.name || memberId
              } is in team ${team.name} but teamIds doesn't include ${team.id}`
            );
            verificationErrors++;
          }
        }
      }
    }

    if (verificationErrors === 0) {
      console.log(
        "✅ Verification passed: All team memberships are in sync!\n"
      );
    } else {
      console.log(`⚠️  Found ${verificationErrors} verification errors\n`);
    }
  } catch (error) {
    console.error("❌ Fatal error during synchronization:", error);
    throw error;
  }
}

// Run the script
syncTeamMembership()
  .then(() => {
    console.log("✅ Script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Script failed:", error);
    process.exit(1);
  });
