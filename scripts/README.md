# Firebase Admin Scripts

Nämä skriptit käyttävät Firebase Admin SDK:ta ja vaativat `fairdeal-pro-firebase-adminsdk.json` -service account -avaimen projektin juuressa.

## Käyttäjän poisto Authentication-palvelusta

### Milloin tarvitaan?

Kun admin poistaa käyttäjän sovelluksen kautta, käyttäjä poistetaan vain Firestore-tietokannasta. Käyttäjä voi edelleen kirjautua sisään Firebase Authentication -palvelun kautta.

Tämä skripti poistaa käyttäjän **sekä Firestore:sta että Authentication-palvelusta**.

### Käyttö

```bash
node scripts/deleteAuthUser.js <user-uid>
```

### Esimerkki

```bash
# Poista käyttäjä UID:llä abc123xyz456
node scripts/deleteAuthUser.js abc123xyz456
```

### Mitä skripti tekee?

1. **Tarkistaa** onko käyttäjä olemassa Firestore:ssa ja Authentication:ssa
2. **Näyttää** käyttäjän tiedot (nimi, sähköposti, joukkueet)
3. **Pyytää vahvistuksen** (kirjoita "POISTA")
4. **Poistaa** käyttäjän molemmista palveluista:
   - Firestore `users` -kokoelmasta
   - Firebase Authentication -palvelusta

### Turvallisuus

- Skripti **vaatii vahvistuksen** ennen poistoa
- Näyttää käyttäjän tiedot ennen poistoa
- Ilmoittaa selkeästi mitä poistetaan ja mistä
- Jos käyttäjää ei löydy, skripti lopettaa turvallisesti

### Huomioita

- Jos käyttäjä on jo poistettu jommastakummasta palvelusta, skripti poistaa vain toisesta
- UID löytyy sovelluksen konsolista tai Firebase Consolesta
- **TÄRKEÄÄ**: Skripti poistaa käyttäjän **pysyvästi** - toimintoa ei voi perua!

## Muut hyödylliset skriptit

- `syncTeamMembership.js` - Synkronoi team.members → player.teamIds
- `fixTeamsField.js` - Korjaa teams-kentän käyttämään nimiä ID:iden sijaan
- `checkTeamsField.js` - Tarkistaa teams-kentän johdonmukaisuuden
- `addNoTeamToKuntokiekkoilijat.js` - Lisää NO_TEAM pelaajat joukkueeseen
- `removeMembersField.js` - Poistaa members-kentän teams-kokoelmasta
- `addTeamMemberField.js` - Lisää teamMember-kentän kaikille käyttäjille (vakiokävijä-status joukkueittain)
