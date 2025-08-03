const { initializeApp } = require("firebase/app");
const { getFirestore, collection, addDoc } = require("firebase/firestore");

// Firebase config - käytä samaa kuin appissa
const firebaseConfig = {
  // Lisää omat Firebase config tiedot tähän jos tarvitaan
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const testPlayers = [
  {
    name: "Testi Pelaaja 1",
    email: "testi1@example.com",
    skill: 7,
    position: "Kenttäpelaaja",
  },
  {
    name: "Testi Pelaaja 2",
    email: "testi2@example.com",
    skill: 8,
    position: "Kenttäpelaaja",
  },
  {
    name: "Testi Maalivahti",
    email: "mv@example.com",
    skill: 6,
    position: "Maalivahti",
  },
];

async function addTestPlayers() {
  try {
    for (const player of testPlayers) {
      const docRef = await addDoc(collection(db, "players"), player);
      console.log(`Added player ${player.name} with ID: ${docRef.id}`);
    }
    console.log("All test players added successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Error adding test players:", error);
    process.exit(1);
  }
}

addTestPlayers();
