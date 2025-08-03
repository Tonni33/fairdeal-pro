const { initializeApp } = require("firebase/app");
const {
  getFirestore,
  collection,
  getDocs,
  deleteDoc,
  doc,
} = require("firebase/firestore");

// Firebase config
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

const deletePlayersCollection = async () => {
  try {
    console.log("🗑️  Aloitetaan players kokoelman poisto...");

    // Hae kaikki dokumentit players kokoelmasta
    const playersSnapshot = await getDocs(collection(db, "players"));
    const players = playersSnapshot.docs;

    console.log(`📊 Löytyi ${players.length} dokumenttia poistettavaksi`);

    let deletedCount = 0;
    let errorCount = 0;

    // Poista jokainen dokumentti
    for (const playerDoc of players) {
      try {
        await deleteDoc(doc(db, "players", playerDoc.id));
        console.log(`🗑️  Poistettu: ${playerDoc.id}`);
        deletedCount++;
      } catch (error) {
        console.error(`❌ Virhe poistaessa ${playerDoc.id}:`, error);
        errorCount++;
      }
    }

    console.log(`\n📊 Poisto valmis:`);
    console.log(`🗑️  Poistettu: ${deletedCount}`);
    console.log(`❌ Epäonnistui: ${errorCount}`);

    if (deletedCount > 0 && errorCount === 0) {
      console.log(`\n🎉 Players kokoelma poistettu onnistuneesti!`);
    }
  } catch (error) {
    console.error("❌ Poisto epäonnistui:", error);
    process.exit(1);
  }
};

// Kysy varmistus
const readline = require("readline");
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question(
  "⚠️  VAROITUS: Tämä poistaa KAIKKI dokumentit players kokoelmasta pysyvästi!\nOletko varma että migraatio on onnistunut ja haluat jatkaa? (y/N): ",
  (answer) => {
    if (answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
      deletePlayersCollection().then(() => {
        console.log("✅ Players kokoelman poisto valmis!");
        process.exit(0);
      });
    } else {
      console.log("❌ Poisto peruutettu");
      process.exit(0);
    }
    rl.close();
  }
);
