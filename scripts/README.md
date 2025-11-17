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

## Data migration skriptit

### migrateToNewPlayerFields.js - Siirtää pelaajat uuteen datarakenteeseen

**Tarkoitus:** Päivittää kaikki käyttäjät uuteen pelaajadatarakenteeseen, jossa:

- `position` (string) → `positions` (array)
- Lisätään `teamSkills` rakenne joukkuekohtaisilla taidoilla

**Käyttö:**

```bash
node scripts/migrateToNewPlayerFields.js
```

**Mitä skripti tekee:**

1. **Positions-konversio:**

   - Luo `positions` array vanhasta `position` kentästä
   - Esim: `"H"` → `["H"]`, `"H/P"` → `["H", "P"]`
   - Oletusarvo jos puuttuu: `["H"]`

2. **TeamSkills-rakenne:**

   - Luo `teamSkills` objektin jokaiselle joukkueelle (player.teamIds)
   - Rakenne: `teamSkills[teamId] = { field: {category, multiplier}, goalkeeper: {category, multiplier} }`
   - Käyttää olemassa olevia `category` ja `multiplier` arvoja oletuksina
   - Oletusarvot: category=2, multiplier=2.0

3. **Backward compatibility:**
   - Säilyttää vanhat kentät (`position`, `category`, `multiplier`)
   - Varmistaa yhteensopivuuden vanhan koodin kanssa

**Turvallisuus:**

- Tarkistaa ennen päivitystä onko kentät jo olemassa
- Ohittaa pelaajat joilla jo uusi rakenne
- Laskee ja raportoi päivitykset

**Huomioita:**

- Aja kerran kun uusi datarakenne otetaan käyttöön
- Vanhat kentät säilyvät, joten rollback mahdollinen
- Ei riko olemassa olevaa dataa

## Muut hyödylliset skriptit

- `syncTeamMembership.js` - Synkronoi team.members → player.teamIds
- `fixTeamsField.js` - Korjaa teams-kentän käyttämään nimiä ID:iden sijaan
- `checkTeamsField.js` - Tarkistaa teams-kentän johdonmukaisuuden
- `addNoTeamToKuntokiekkoilijat.js` - Lisää NO_TEAM pelaajat joukkueeseen
- `removeMembersField.js` - Poistaa members-kentän teams-kokoelmasta (DEPRECATED - käytä cleanupTeamMembers.js)
- `cleanupTeamMembers.js` - **SUOSITELTU:** Poistaa team.members ja lisää team.memberCount (laskettu player.teamIds:stä)
- `addTeamMemberField.js` - Lisää teamMember-kentän kaikille käyttäjille (vakiokävijä-status joukkueittain)

### cleanupTeamMembers.js - Modernisoi joukkueiden jäsenyysdata

**Tarkoitus:**

- Poistaa vanhentunut `team.members` kenttä kaikista joukkueista
- **player.teamIds on nyt ainoa lähde joukkuejäsenyyksille**

**Käyttö:**

```bash
node scripts/cleanupTeamMembers.js CONFIRM
```

**Mitä tapahtuu:**

1. Hakee kaikki joukkueet teams-kokoelmasta
2. Jokaiselle joukkueelle:
   - Poistaa `members` kentän (jos olemassa)
3. Raportoi päivitykset

**Miksi tämä skripti:**

- Kun admin luo käyttäjälle väliaikaisen salasanan, käyttäjän ID saattaa vaihtua
- Vanha `team.members` lista ei päivity automaattisesti → jää vanhoja ID:itä
- `player.teamIds` on ainoa lähde joka päivittyy oikein
- Jäsenmäärä lasketaan dynaamisesti UI:ssa suoraan pelaajien `teamIds`:stä

**Turvallisuus:**

- Vaatii CONFIRM parametrin suoritukseen
- Ei muuta player-dataa
- Ei riko olemassa olevia team-dokumentteja

**Huomioita:**

- Aja tämä kerran kun otat player.teamIds-mallin käyttöön
- Koodi on jo päivitetty käyttämään player.teamIds:tä
- team.members ei enää päivity missään koodin osassa
