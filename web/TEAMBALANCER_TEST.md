# TeamBalancer Test Page - Käyttöohje

## Mikä on TeamBalancer Test Page?

TeamBalancer Test Page on admin-työkalu, joka mahdollistaa joukkueenjakoalgoritmin (TeamBalancer) testaamisen ja visualisoinnin olemassa olevilla joukkueilla ja tapahtumilla. Sivu näyttää selvästi ja yksityiskohtaisesti, miten algoritmi toimii vaihe vaiheelta.

## Miten päästä sivulle?

1. Kirjaudu FairDealPro Admin -paneliin (web)
2. Vain Master Admin -käyttäjät näkevät sivupalkin linkin "TeamBalancer Test"
3. Klikkaa "TeamBalancer Test" -linkkiä sivupalkissa

## Sivun käyttö

### 1. Testikonfiguraatio

Sivun yläosassa on kolme valintakenttää:

#### a) Select Team

- Valitse joukkue, jonka tapahtumia haluat testata
- Lista sisältää kaikki järjestelmässä olevat joukkueet

#### b) Select Event

- Valitse tapahtuma, jonka pelaajilla haluat testata jakoa
- Lista päivittyy automaattisesti valitun joukkueen tapahtumiin
- Näyttää tapahtuman nimen ja päivämäärän

#### c) Distribution Method

- **Skill-Based**: Jakaa pelaajat taitotason (category & multiplier) perusteella
- **Position-Based**: Jakaa pelaajat pelipaikkojen (hyökkääjät/puolustajat) perusteella

### 2. Algoritmin suoritus

1. Kun kaikki kentät on valittu, klikkaa **"Run Team Balancer"** -nappia
2. Algoritmi suorittaa jaon ja näyttää prosessin vaihe vaiheelta

### 3. Tulokset

Sivulla näytetään seuraavat osiot:

#### A) Algorithm Execution Steps

Näyttää algoritmin suorituksen vaiheet:

- **Step 1**: Ladataan tapahtuma- ja joukkuetiedot
- **Step 2**: Näytetään ladatut tiedot
- **Step 3**: Ladataan rekisteröidyt pelaajat
- **Step 4**: Näytetään pelaajien tiedot ja jakaumat (maalivahdit, kenttäpelaajat, kategoriat)
- **Step 5**: Ajetaan TeamBalancer-algoritmi
- **Step 6**: Näytetään lopulliset joukkueet ja tasapainopisteytys

Jokainen vaihe voidaan avata nähdäksesi yksityiskohtaiset tiedot JSON-muodossa.

#### B) Algorithm Console Output

Näyttää algoritmin koko console.log-ulostulon tumman teeman konsolissa:

- Näkee tarkalleen, miten algoritmi tekee päätökset
- Näkee pelaajien jaon vaihe vaiheelta
- Näkee kategoriapohjaisen jakamisen logiikan
- Näkee tasapainotuksen iteraatiot

Tämä on **tärkein** osio ymmärtääksesi algoritmin toimintaa!

#### C) Generated Teams Result

##### Yhteenveto (Summary Cards)

- **Balance Score**: Joukkueiden tasapainopisteytys (mitä lähempänä 0, sitä tasaisemmat joukkueet)
- **Teams Generated**: Generoitujen joukkueiden määrä (aina 2)
- **Unused Players**: Käyttämättä jääneiden pelaajien määrä

##### Varoitukset (Warnings)

Jos algoritmi havaitsee ongelmia (esim. epätasainen maalivahtijakauma), ne näytetään varoituksina.

##### Joukkueet (Teams Comparison)

Jokainen joukkue näytetään omassa kortissaan:

**Perustiedot:**

- Joukkueen nimi (esim. "Joukkue A")
- Total Points: Joukkueen kokonaispisteet
- Players: Pelaajien määrä
- Goalkeepers: Maalivahtien määrä
- Field Players: Kenttäpelaajien määrä

**Category Distribution:**

- Cat 1: Kategoria 1 pelaajat (parhaat)
- Cat 2: Kategoria 2 pelaajat (keskitaso)
- Cat 3: Kategoria 3 pelaajat (aloittelijat)

**Pelaajalistat (Players):**
Taulukko jokaisesta pelaajasta:

- Name: Pelaajan nimi
- Pos: Pelipaikka (H/P/MV)
- Cat: Kategoria (1/2/3)
- Mult: Multiplier (kerroin)
- Points: Pisteet

## Mitä tietoa kannattaa tarkkailla?

### 1. Balance Score

- Arvo lähellä 0 = hyvä tasapaino
- Yli 50 = merkittävä epätasapaino
- Yli 100 = huono tasapaino

### 2. Category Distribution

- Kategoria 1 pelaajien määrä tulisi olla mahdollisimman tasainen molemmissa joukkueissa
- Algoritmi yrittää priorisoida Cat 1 tasapainoa

### 3. Console Output

Tärkeimmät logit:

- "Category distribution" - Näyttää pelaajien alkujakauman
- "Category X: Better player → Team Y" - Näyttää mihin joukkueeseen parempi pelaaja menee ja miksi
- "After: X vs Y" - Näyttää joukkueiden vahvuudet jaon jälkeen

### 4. Goalkeepers

- Tarkista että maalivahdit on jaettu tasaisesti
- Jos toinen joukkue saa enemmän maalivahteja, algoritmi antaa varoituksen

## Esimerkkikäyttötapaukset

### Use Case 1: Testaa uutta jako-algoritmia

1. Valitse joukkue ja tapahtuma
2. Aja jako "Skill-Based" -metodilla
3. Tarkista Balance Score ja Category Distribution
4. Aja uudelleen "Position-Based" -metodilla
5. Vertaile tuloksia

### Use Case 2: Debuggaa huonoa jakoa

1. Jos käyttäjä raportoi epätasaisen jaon tietystä tapahtumasta
2. Valitse kyseinen joukkue ja tapahtuma
3. Tarkista Console Output nähdäksesi mikä meni vikaan
4. Analysoi pelaajien kategoriat ja multiplierit
5. Korjaa pelaajien taitotasot tarvittaessa

### Use Case 3: Vertaa eri jaon metodeja

1. Aja sama jako sekä Skill-Based että Position-Based -metodeilla
2. Vertaile Balance Scoreja
3. Tarkista Console Outputista eroavaisuudet
4. Valitse parempi metodi kyseiselle tapahtumalle

## Tekninen toteutus

- **Frontend**: React + TypeScript + Material-UI
- **Backend**: Firebase Firestore
- **Algoritmi**: TeamBalancer-luokka (jaettu mobiili- ja web-sovelluksen kesken)
- **Data**: Reaaliaikainen data Firestoresta (joukkueet, tapahtumat, pelaajat)

## Huomioitavaa

1. **Vain Master Admin** pääsee sivulle
2. Sivu **ei tallenna** jaettuja joukkueita - se on vain testaustyökalu
3. Algoritmi käyttää **samaa koodia** kuin mobiilisovellus
4. Console output voi olla pitkä suurilla tapahtumilla
5. Sivu lataa **kaikki joukkueet ja tapahtumat** käynnistyessään

## Troubleshooting

### Joukkueet tai tapahtumat eivät lataudu

- Tarkista että käyttäjällä on Master Admin -oikeudet
- Tarkista Firebase-yhteys
- Avaa selaimen konsoli virheilmoituksia varten

### Balance Score on aina sama

- Algoritmi sisältää satunnaisuutta kategoriapareissa
- Jos Balance Score on aina täsmälleen sama, voi olla että pelaajat ovat liian tasaisia

### Console Output on tyhjä

- Varmista että algoritmi on ajettu loppuun
- Tarkista selaimen konsolista mahdolliset virheet
- Päivitä sivu ja yritä uudelleen

## Kehitysideoita tulevaisuuteen

- [ ] Mahdollisuus tallentaa testitulokset
- [ ] Vertaile useita jakoja rinnakkain
- [ ] Simuloi useita jakoja peräkkäin ja näytä keskiarvot
- [ ] Exporttaa tulokset CSV/PDF-muotoon
- [ ] Visualisoi joukkueiden tasapaino graafisesti
- [ ] Lisää custom-parametreja algoritmille (esim. max cat 1 per team)
