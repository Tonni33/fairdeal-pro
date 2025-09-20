const { initializeApp, getApps } = require("firebase/app");
const { getFirestore, doc, getDoc, updateDoc } = require("firebase/firestore");

const firebaseConfig = {
  apiKey: "AIzaSyBzO7DQLHK6u1MzZZm7ZSZP_WdEhBzXJXM",
  authDomain: "fairdealpro-8b5bf.firebaseapp.com",
  projectId: "fairdealpro-8b5bf",
  storageBucket: "fairdealpro-8b5bf.appspot.com",
  messagingSenderId: "269993168430",
  appId: "1:269993168430:web:c1c6a3f1f1f1f1f1f1f1f1",
};

// Initialize Firebase if not already initialized
const app =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);

async function updateHCKeLoTeamAdmins() {
  try {
    const hcKeLoTeamId = "7vfx0X3aQGIZ896jw2E2";

    console.log("🔍 Checking HC KeLo team before update...");

    // Get current team data
    const teamDoc = await getDoc(doc(db, "teams", hcKeLoTeamId));

    if (!teamDoc.exists()) {
      console.log("❌ HC KeLo team not found with ID:", hcKeLoTeamId);
      return;
    }

    const teamData = teamDoc.data();
    console.log("📋 Current team data:");
    console.log("   name:", teamData.name);
    console.log("   adminId:", teamData.adminId);
    console.log("   adminIds:", teamData.adminIds);
    console.log("   members:", teamData.members);

    // Check if team already has adminIds array
    if (teamData.adminIds && Array.isArray(teamData.adminIds)) {
      console.log(
        "✅ Team already has adminIds array with",
        teamData.adminIds.length,
        "admins"
      );
      console.log("   adminIds:", teamData.adminIds);
      return;
    }

    // Create adminIds array from current adminId
    const adminIds = [];

    if (teamData.adminId) {
      console.log(
        "🔧 Adding legacy adminId to adminIds array:",
        teamData.adminId
      );
      adminIds.push(teamData.adminId);
    }

    // Add the second admin ID (you'll need to provide this)
    // Replace "SECOND_ADMIN_ID" with the actual user ID of the second admin
    const secondAdminId = "SECOND_ADMIN_ID_HERE"; // Replace this with actual ID

    console.log("❓ Current adminIds array:", adminIds);
    console.log(
      "❓ Would you like to add a second admin? Please provide the user ID."
    );
    console.log(
      "   You can get user IDs from the users collection in Firebase."
    );

    // For now, let's just update with the current adminId in an array
    if (adminIds.length > 0) {
      console.log("🔧 Updating team with adminIds array:", adminIds);

      await updateDoc(doc(db, "teams", hcKeLoTeamId), {
        adminIds: adminIds,
      });

      console.log("✅ HC KeLo team updated successfully!");
      console.log("   adminIds:", adminIds);

      // Verify the update
      const updatedTeamDoc = await getDoc(doc(db, "teams", hcKeLoTeamId));
      const updatedTeamData = updatedTeamDoc.data();
      console.log("📋 Updated team data:");
      console.log("   adminId:", updatedTeamData.adminId);
      console.log("   adminIds:", updatedTeamData.adminIds);
    } else {
      console.log("⚠️ No adminId found to migrate");
    }
  } catch (error) {
    console.error("❌ Error updating HC KeLo team:", error);
  }
}

updateHCKeLoTeamAdmins();
