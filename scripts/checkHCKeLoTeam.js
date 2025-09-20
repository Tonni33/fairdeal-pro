const { initializeApp, getApps } = require("firebase/app");
const {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
} = require("firebase/firestore");

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

async function checkHCKeLoTeam() {
  try {
    console.log("🔍 Checking HC KeLo team data...");

    // Get all teams first
    const teamsRef = collection(db, "teams");
    const teamsSnapshot = await getDocs(teamsRef);

    let hcKeLoTeam = null;

    teamsSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.name && data.name.toLowerCase().includes("kelo")) {
        console.log(`\n📋 Found team: ${data.name} (ID: ${doc.id})`);
        console.log("   adminId:", data.adminId);
        console.log("   adminIds:", data.adminIds);
        console.log("   members:", data.members);

        hcKeLoTeam = {
          id: doc.id,
          ...data,
        };
      }
    });

    if (hcKeLoTeam) {
      console.log("\n🎯 HC KeLo team found:");
      console.log("Team data:", JSON.stringify(hcKeLoTeam, null, 2));

      // Check admin users
      if (hcKeLoTeam.adminIds && Array.isArray(hcKeLoTeam.adminIds)) {
        console.log("\n👥 Checking adminIds users:");
        for (const adminId of hcKeLoTeam.adminIds) {
          const userDoc = await getDoc(doc(db, "users", adminId));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            console.log(`✅ Admin ${adminId}:`, {
              displayName: userData.displayName,
              name: userData.name,
              email: userData.email,
            });
          } else {
            console.log(`❌ Admin ${adminId}: User not found`);
          }
        }
      }

      if (hcKeLoTeam.adminId) {
        console.log("\n👤 Checking legacy adminId user:");
        const userDoc = await getDoc(doc(db, "users", hcKeLoTeam.adminId));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          console.log(`✅ Legacy admin ${hcKeLoTeam.adminId}:`, {
            displayName: userData.displayName,
            name: userData.name,
            email: userData.email,
          });
        } else {
          console.log(`❌ Legacy admin ${hcKeLoTeam.adminId}: User not found`);
        }
      }
    } else {
      console.log("❌ HC KeLo team not found");
    }
  } catch (error) {
    console.error("Error checking team:", error);
  }
}

checkHCKeLoTeam();
