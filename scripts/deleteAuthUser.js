const admin = require("firebase-admin");
const serviceAccount = require("../fairdeal-pro-firebase-adminsdk.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const auth = admin.auth();
const db = admin.firestore();

async function deleteAuthUser() {
  // Tarkista että UID on annettu
  const uid = process.argv[2];

  if (!uid) {
    console.error("❌ Virhe: Käyttäjän UID puuttuu");
    console.log("\nKäyttö: node deleteAuthUser.js <user-uid>");
    console.log("Esimerkki: node deleteAuthUser.js abc123xyz456\n");
    process.exit(1);
  }

  try {
    console.log(`\n🔍 Etsitään käyttäjää UID:llä: ${uid}...\n`);

    // Tarkista onko käyttäjä olemassa Firestore:ssa
    const userDoc = await db.collection("users").doc(uid).get();
    const firestoreExists = userDoc.exists;

    if (firestoreExists) {
      const userData = userDoc.data();
      console.log(`📋 Firestore tiedot löytyivät:`);
      console.log(`   Nimi: ${userData.name}`);
      console.log(`   Sähköposti: ${userData.email}`);
      console.log(
        `   Joukkueet: ${userData.teams?.join(", ") || "Ei joukkueita"}`
      );
    } else {
      console.log(`⚠️  Käyttäjää ei löydy Firestore:sta`);
    }

    // Tarkista onko käyttäjä olemassa Authentication:ssa
    let authExists = false;
    let authEmail = "";
    try {
      const authUser = await auth.getUser(uid);
      authExists = true;
      authEmail = authUser.email;
      console.log(`\n🔐 Authentication tiedot löytyivät:`);
      console.log(`   Sähköposti: ${authUser.email}`);
      console.log(
        `   Luotu: ${new Date(
          authUser.metadata.creationTime
        ).toLocaleDateString("fi-FI")}`
      );
    } catch (error) {
      if (error.code === "auth/user-not-found") {
        console.log(`\n✅ Käyttäjää ei ole Authentication:ssa (jo poistettu)`);
      } else {
        throw error;
      }
    }

    // Jos käyttäjää ei löydy kummassakaan, lopeta
    if (!firestoreExists && !authExists) {
      console.log(`\n❌ Käyttäjää ${uid} ei löydy kummastakin palvelusta.\n`);
      process.exit(1);
    }

    // Vahvistus
    console.log(
      `\n⚠️  VAROITUS: Tämä poistaa käyttäjän seuraavista palveluista:`
    );
    if (firestoreExists) console.log(`   - Firestore users-kokoelma`);
    if (authExists) console.log(`   - Firebase Authentication`);
    console.log(`\nHaluatko jatkaa? Kirjoita "POISTA" vahvistaaksesi:`);

    // Odota käyttäjän vahvistusta
    const readline = require("readline").createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    readline.question("", async (answer) => {
      readline.close();

      if (answer.trim() !== "POISTA") {
        console.log("\n❌ Poisto peruutettu.\n");
        process.exit(0);
      }

      console.log(`\n🗑️  Poistetaan käyttäjä...\n`);

      // Poista Firestore-dokumentti
      if (firestoreExists) {
        await db.collection("users").doc(uid).delete();
        console.log(`✅ Poistettu Firestore:sta`);
      }

      // Poista Authentication-käyttäjä
      if (authExists) {
        await auth.deleteUser(uid);
        console.log(`✅ Poistettu Authentication:sta`);
      }

      console.log(
        `\n✨ Käyttäjä ${authEmail || uid} poistettu onnistuneesti!\n`
      );
      process.exit(0);
    });
  } catch (error) {
    console.error("\n❌ Virhe poistettaessa käyttäjää:", error.message);
    if (error.code) {
      console.error(`Virhekoodi: ${error.code}`);
    }
    process.exit(1);
  }
}

deleteAuthUser();
