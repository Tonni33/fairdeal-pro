const { initializeApp } = require("firebase/app");
const {
  getFirestore,
  collection,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
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

const migratePlayersToUsers = async () => {
  try {
    console.log("🔄 Aloitetaan käyttäjien siirto players -> users...");

    // 1. Hae kaikki pelaajat players kokoelmasta
    const playersSnapshot = await getDocs(collection(db, "players"));
    const players = playersSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    console.log(`📊 Löytyi ${players.length} pelaajaa siirrettäväksi`);

    let successCount = 0;
    let errorCount = 0;

    // 2. Siirrä jokainen pelaaja users kokoelmaan
    for (const player of players) {
      try {
        // Muunna kenttien nimet yhtenäisiksi
        const userData = {
          name: player.name,
          displayName: player.name, // Lisää displayName
          email: player.email || "",
          phone: player.phone || "",
          image: player.image || "",

          // Muunna teams -> teamIds
          teamIds: player.teams || player.teamIds || [],

          // Säilytä muut kentät
          position: player.position || "H",
          category: player.category || 1,
          multiplier: player.multiplier || 1.0,
          isAdmin: player.isAdmin || false,

          // Migraation tiedot
          createdAt: player.createdAt || new Date(),
          createdBy: player.createdBy || "migration",
          migratedAt: new Date(),
          migratedFrom: "players",

          // Jos sähköposti on annettu, tarvitsee salasanan
          needsPasswordChange: player.email ? true : false,
        };

        // Luo uusi dokumentti users kokoelmaan
        await setDoc(doc(db, "users", player.id), userData);

        console.log(
          `✅ Siirretty: ${player.name} (${player.email || "ei sähköpostia"})`
        );
        successCount++;
      } catch (error) {
        console.error(`❌ Virhe siirrettäessä ${player.name}:`, error);
        errorCount++;
      }
    }

    console.log(`\n📊 Siirto valmis:`);
    console.log(`✅ Onnistui: ${successCount}`);
    console.log(`❌ Epäonnistui: ${errorCount}`);

    if (successCount > 0 && errorCount === 0) {
      console.log(
        `\n⚠️  HUOMIO: Nyt voit turvallisesti poistaa players kokoelman.`
      );
      console.log(`   Aja seuraava komento kun olet varma että kaikki toimii:`);
      console.log(`   node scripts/deletePlayersCollection.js`);
    }
  } catch (error) {
    console.error("❌ Migraatio epäonnistui:", error);
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
  "Haluatko varmasti siirtää kaikki pelaajat players -> users kokoelmaan? (y/N): ",
  (answer) => {
    if (answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
      migratePlayersToUsers().then(() => {
        console.log("🎉 Migraatio valmis!");
        process.exit(0);
      });
    } else {
      console.log("❌ Migraatio peruutettu");
      process.exit(0);
    }
    rl.close();
  }
);
