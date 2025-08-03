const { initializeApp } = require("firebase/app");
const {
  getFirestore,
  collection,
  getDocs,
  doc,
  updateDoc,
} = require("firebase/firestore");

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAu7G-FQHMntSeovsdmbaTGG_PUep-sM5E",
  authDomain: "fairdeal-c0a58.firebaseapp.com",
  projectId: "fairdeal-c0a58",
  storageBucket: "fairdeal-c0a58.firebasestorage.app",
  messagingSenderId: "365045026562",
  appId: "1:365045026562:web:63ac8f11801bd2f2623c1b",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Function to generate a random team code
function generateTeamCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Function to migrate team codes from licenceCode to code field
async function migrateTeamCodes() {
  try {
    console.log("Fetching teams...");
    const teamsSnapshot = await getDocs(collection(db, "teams"));

    const updatePromises = [];

    teamsSnapshot.forEach((teamDoc) => {
      const teamData = teamDoc.data();
      const teamName = teamData.name || "Unknown Team";

      console.log(`\nProcessing team: ${teamName}`);
      console.log(`  Current code: ${teamData.code || "None"}`);
      console.log(`  Current licenceCode: ${teamData.licenceCode || "None"}`);

      // Determine what to do with this team
      let newCode = null;

      if (teamData.code && teamData.licenceCode) {
        // Both exist - keep code, remove licenceCode
        console.log(`  ✓ Both exist, keeping code: ${teamData.code}`);
        updatePromises.push(
          updateDoc(doc(db, "teams", teamDoc.id), {
            licenceCode: null,
          })
        );
      } else if (teamData.licenceCode && !teamData.code) {
        // Only licenceCode exists - move it to code
        newCode = teamData.licenceCode;
        console.log(`  → Moving licenceCode to code: ${newCode}`);
        updatePromises.push(
          updateDoc(doc(db, "teams", teamDoc.id), {
            code: newCode,
            licenceCode: null,
          })
        );
      } else if (!teamData.code && !teamData.licenceCode) {
        // Neither exists - generate new code
        newCode = generateTeamCode();
        console.log(`  + Generating new code: ${newCode}`);
        updatePromises.push(
          updateDoc(doc(db, "teams", teamDoc.id), {
            code: newCode,
          })
        );
      } else {
        // Only code exists - nothing to do
        console.log(`  ✓ Only code exists, no changes needed`);
      }
    });

    if (updatePromises.length > 0) {
      console.log(`\nUpdating ${updatePromises.length} teams...`);
      await Promise.all(updatePromises);
      console.log("✅ Migration completed successfully!");
    } else {
      console.log("\n✅ No teams need updating");
    }

    // Show final state
    console.log("\n=== Final State ===");
    const finalSnapshot = await getDocs(collection(db, "teams"));
    finalSnapshot.forEach((teamDoc) => {
      const teamData = teamDoc.data();
      console.log(
        `${teamData.name || "Unknown"}: code="${teamData.code || "None"}"`
      );
    });
  } catch (error) {
    console.error("❌ Error during migration:", error);
  }
}

// Run the script
console.log("🚀 Starting team code migration...");
migrateTeamCodes();
