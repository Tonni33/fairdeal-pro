const admin = require("firebase-admin");
const serviceAccount = require("../fairdeal-pro-firebase-adminsdk.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

/**
 * Migration script to update all users to new player data structure:
 * 1. Add positions array if missing (convert from old position field)
 * 2. Add teamSkills structure if missing (with default values for each team)
 * 3. Keep legacy fields for backward compatibility during transition
 */
async function migrateToNewPlayerFields() {
  console.log("🔄 Migrating users to new player field structure...\n");

  try {
    // Fetch all users
    const usersSnapshot = await db.collection("users").get();
    const users = usersSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    console.log(`📋 Found ${users.length} users to process\n`);

    let updatedCount = 0;
    let skippedCount = 0;
    let errors = 0;

    for (const user of users) {
      try {
        const updates = {};
        let needsUpdate = false;

        // 1. Migrate position → positions array
        if (!user.positions || !Array.isArray(user.positions)) {
          const validPositions = ["H", "P", "H/P", "MV"];
          let normalizedPosition = "H"; // Default to field player

          if (typeof user.position === "string") {
            const pos = user.position.trim().toUpperCase();
            normalizedPosition = validPositions.includes(pos) ? pos : "H";
          }

          // Convert position string to array
          if (normalizedPosition === "H/P") {
            updates.positions = ["H", "P"];
          } else {
            updates.positions = [normalizedPosition];
          }

          needsUpdate = true;
          console.log(
            `  📍 ${
              user.name || user.email
            } - Adding positions: ${updates.positions.join(", ")}`
          );
        }

        // 2. Migrate to teamSkills structure
        if (!user.teamSkills || typeof user.teamSkills !== "object") {
          const teamSkills = {};

          // Create teamSkills for each team the user belongs to
          if (user.teamIds && Array.isArray(user.teamIds)) {
            user.teamIds.forEach((teamId) => {
              // Use existing category/multiplier as defaults if available
              const defaultCategory = user.category || 2;
              const defaultMultiplier = user.multiplier || 2.0;

              teamSkills[teamId] = {
                field: {
                  category: defaultCategory,
                  multiplier: defaultMultiplier,
                },
                goalkeeper: {
                  category: defaultCategory,
                  multiplier: defaultMultiplier,
                },
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              };
            });
          }

          updates.teamSkills = teamSkills;
          needsUpdate = true;

          const teamCount = Object.keys(teamSkills).length;
          console.log(
            `  🎯 ${
              user.name || user.email
            } - Adding teamSkills for ${teamCount} team(s)`
          );
        }

        // 3. Update the user if needed
        if (needsUpdate) {
          updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();

          await db.collection("users").doc(user.id).update(updates);

          console.log(`✅ ${user.name || user.email} - Successfully updated\n`);
          updatedCount++;
        } else {
          console.log(
            `⏭️  ${
              user.name || user.email
            } - Already has new structure, skipping\n`
          );
          skippedCount++;
        }
      } catch (error) {
        console.error(
          `❌ Error updating user ${user.name || user.email}:`,
          error.message
        );
        errors++;
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("📊 Migration Summary:");
    console.log(`   ✅ Updated: ${updatedCount}`);
    console.log(`   ⏭️  Skipped (already migrated): ${skippedCount}`);
    console.log(`   ❌ Errors: ${errors}`);
    console.log(`   📋 Total: ${users.length}`);
    console.log("=".repeat(60) + "\n");

    if (errors === 0) {
      console.log("✨ All users migrated successfully!\n");
      console.log("📝 Changes made:");
      console.log("   • Added 'positions' array (from old 'position' field)");
      console.log(
        "   • Added 'teamSkills' structure (field/goalkeeper skills per team)"
      );
      console.log("   • Legacy fields kept for backward compatibility\n");
    } else {
      console.log("⚠️  Some errors occurred. Check the logs above.\n");
    }
  } catch (error) {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  }

  process.exit(0);
}

migrateToNewPlayerFields();
