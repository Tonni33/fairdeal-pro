const { initializeApp } = require("firebase/app");
const {
  getFirestore,
  collection,
  getDocs,
  doc,
  updateDoc,
} = require("firebase/firestore");

// Firebase configuration - replace with your actual config
const firebaseConfig = {
  // Add your Firebase config here
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "your-app-id",
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

// Function to add codes to teams that don't have them
async function addTeamCodes() {
  try {
    console.log("Fetching teams...");
    const teamsSnapshot = await getDocs(collection(db, "teams"));

    const updatePromises = [];

    teamsSnapshot.forEach((teamDoc) => {
      const teamData = teamDoc.data();
      if (!teamData.code) {
        const code = generateTeamCode();
        console.log(`Adding code ${code} to team: ${teamData.name}`);
        updatePromises.push(updateDoc(doc(db, "teams", teamDoc.id), { code }));
      } else {
        console.log(`Team ${teamData.name} already has code: ${teamData.code}`);
      }
    });

    if (updatePromises.length > 0) {
      await Promise.all(updatePromises);
      console.log(`Successfully added codes to ${updatePromises.length} teams`);
    } else {
      console.log("All teams already have codes");
    }
  } catch (error) {
    console.error("Error adding team codes:", error);
  }
}

// Run the script
addTeamCodes();
