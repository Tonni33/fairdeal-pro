const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkTeamSettings() {
  try {
    const teamsSnapshot = await db.collection('teams').get();
    
    console.log('\n=== Joukkueiden asetukset ===\n');
    
    teamsSnapshot.forEach(doc => {
      const team = doc.data();
      console.log(`Joukkue: ${team.name}`);
      console.log(`  ID: ${doc.id}`);
      console.log(`  guestRegistrationHours: ${team.guestRegistrationHours || 'EI ASETETTU (käyttää oletusta 24h)'}`);
      console.log('');
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Virhe:', error);
    process.exit(1);
  }
}

checkTeamSettings();
