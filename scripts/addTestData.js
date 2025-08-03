const { initializeApp } = require("firebase/app");
const {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
} = require("firebase/firestore");

const firebaseConfig = {
  apiKey: "AIzaSyAu7G-FQHMntSeovsdmbaTGG_PUep-sM5E",
  authDomain: "fairdeal-c0a58.firebaseapp.com",
  projectId: "fairdeal-c0a58",
  storageBucket: "fairdeal-c0a58.firebasestorage.app",
  messagingSenderId: "365045026562",
  appId: "1:365045026562:web:63ac8f11801bd2f2623c1b",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function addTestData() {
  try {
    // Add test users (players)
    const testUsers = [
      {
        name: "Testi Pelaaja 1",
        email: "testi1@example.com",
        phone: "+358401234567",
        category: "Intermediate",
        multiplier: 1.4,
        position: "Hyökkääjä",
        image: "",
        isAdmin: false,
        licenceCode: "TEST001",
        playerId: "test-player-1",
        teamIds: [],
        teams: [],
        createdAt: serverTimestamp(),
      },
      {
        name: "Testi Maalivahti",
        email: "mv@example.com",
        phone: "+358401234568",
        category: "Advanced",
        multiplier: 1.6,
        position: "Maalivahti",
        image: "",
        isAdmin: false,
        licenceCode: "TEST002",
        playerId: "test-player-2",
        teamIds: [],
        teams: [],
        createdAt: serverTimestamp(),
      },
    ];

    for (const user of testUsers) {
      const userDoc = await addDoc(collection(db, "users"), user);
      console.log("Added user:", user.name, "with ID:", userDoc.id);
    }

    // Add test teams first
    const testTeams = [
      {
        name: "Testi Joukkue 1",
        description: "Ensimmäinen testijoukkue",
        color: "#FF0000",
        adminId: "test-user-id", // Tämä pitäisi olla oikea käyttäjän ID
        members: ["test-user-id"], // Tämä pitäisi olla oikea käyttäjän ID
        licenceCode: "TEAM001",
        createdAt: serverTimestamp(),
      },
      {
        name: "Testi Joukkue 2",
        description: "Toinen testijoukkue",
        color: "#0000FF",
        adminId: "test-user-id",
        members: ["test-user-id"],
        licenceCode: "TEAM002",
        createdAt: serverTimestamp(),
      },
    ];

    const teamIds = [];
    for (const team of testTeams) {
      const teamDoc = await addDoc(collection(db, "teams"), team);
      teamIds.push(teamDoc.id);
      console.log("Added team:", team.name, "with ID:", teamDoc.id);
    }

    // Add test events using new Event structure
    const testEvents = [
      {
        title: "Testi Ottelu 1", // title eikä name
        description: "Testipeliä varten luotu ottelu",
        date: new Date("2025-08-01T18:00:00"),
        location: "Testi Kenttä",
        maxPlayers: 20,
        registeredPlayers: [], // registeredPlayers eikä participants
        teams: [],
        teamId: teamIds[0], // teamId eikä teamClubId
        createdBy: "test",
        createdAt: serverTimestamp(),
      },
      {
        title: "Testi Ottelu 2",
        description: "Toinen testipeliä varten luotu ottelu",
        date: new Date("2025-08-05T19:00:00"),
        location: "Testi Kenttä 2",
        maxPlayers: 16,
        registeredPlayers: [],
        teams: [],
        teamId: teamIds[1],
        createdBy: "test",
        createdAt: serverTimestamp(),
      },
    ];

    for (const event of testEvents) {
      const eventDoc = await addDoc(collection(db, "events"), event);
      console.log("Added event:", event.title, "with ID:", eventDoc.id);
    }

    console.log("Test data added successfully!");
  } catch (error) {
    console.error("Error adding test data:", error);
  }
}

addTestData();
