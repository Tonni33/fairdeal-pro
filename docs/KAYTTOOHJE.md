# FairDealPro - Käyttöohje

## Sisällysluettelo

1. [Johdanto](#johdanto)
2. [Käyttäjäohjeet](#käyttäjäohjeet)
   - [Rekisteröityminen](#rekisteröityminen)
   - [Kirjautuminen](#kirjautuminen)
   - [Joukkueeseen liittyminen](#joukkueeseen-liittyminen)
   - [Tapahtumiin osallistuminen](#tapahtumiin-osallistuminen)
   - [Profiilin hallinta](#profiilin-hallinta)
3. [Admin-ohjeet](#admin-ohjeet)
   - [Joukkueen luominen](#joukkueen-luominen)
   - [Pelaajien hallinta](#pelaajien-hallinta)
   - [Pelaajien kategorisointi](#pelaajien-kategorisointi)
   - [Tapahtumien hallinta](#tapahtumien-hallinta)
   - [Tiimien luonti](#tiimien-luonti-tapahtumaan)
   - [Käyttäjähallinta](#käyttäjähallinta)
   - [Liittymiskoodin jakaminen](#liittymiskoodin-jakaminen)
   - [Salasanojen hallinta](#salasanojen-hallinta)

---

## Johdanto

FairDealPro on mobiilisovellus urheilujoukkueiden hallintaan ja tasapuolisten tiimien luomiseen. Sovellus mahdollistaa:

- Pelaajien taitotasojen arvioinnin
- Tasapuolisten tiimien automaattisen luonnin
- Tapahtumien hallinnan ja ilmoittautumisen
- Joukkueen viestinnän

---

## Käyttäjäohjeet

### Rekisteröityminen

#### Tapa 1: Oma rekisteröityminen

1. Avaa FairDealPro-sovellus
2. Valitse **"Rekisteröidy"**
3. Täytä tiedot:
   - Sähköpostiosoite
   - Salasana (vähintään 6 merkkiä)
   - Nimi
4. Paina **"Rekisteröidy"**
5. Voit nyt liittyä joukkueisiin liittymiskoodilla

#### Tapa 2: Admin on luonut tilin puolestasi

1. Saat adminilta sähköpostiosoitteesi ja väliaikaisen salasanan
2. Avaa sovellus ja valitse **"Kirjaudu"**
3. Kirjaudu sähköpostilla ja väliaikaisella salasanalla
4. Sovellus pyytää vaihtamaan salasanan → luo uusi henkilökohtainen salasana
5. Olet nyt kirjautunut ja liitetty joukkueeseen

### Kirjautuminen

1. Avaa sovellus
2. Syötä sähköpostiosoite ja salasana
3. Paina **"Kirjaudu"**

**Unohditko salasanan?**

1. Paina **"Unohditko salasanan?"** kirjautumissivulla
2. Syötä sähköpostiosoitteesi
3. Saat salasanan palautuslinkin sähköpostiisi
4. Seuraa linkkiä ja luo uusi salasana

### Joukkueeseen liittyminen

1. Pyydä joukkueen adminilta **liittymiskoodi** (6-merkkinen koodi)
2. Mene sovelluksessa **Profiili** → **Liity joukkueeseen**
3. Syötä liittymiskoodi
4. Olet nyt joukkueen jäsen

### Tapahtumiin osallistuminen

1. Mene **Tapahtumat**-näkymään
2. Valitse tapahtuma johon haluat osallistua
3. Paina **"Ilmoittaudu"** tai **"Ilmoittaudu varaksi"**
4. Voit myös perua ilmoittautumisen painamalla **"Peru ilmoittautuminen"**

**Huom:** Tapahtumat voivat olla rajoitettuja (esim. max 20 pelaajaa). Jos paikat ovat täynnä, voit ilmoittautua varasijalle.

### Profiilin hallinta

1. Mene **Profiili**-näkymään
2. Voit muokata:
   - Nimeä
   - Puhelinnumeroa
   - Profiilikuvaa
   - Pelipositioita (H = hyökkääjä, P = puolustaja, MV = maalivahti)
3. Paina **"Tallenna"** muutosten jälkeen

---

## Admin-ohjeet

### Joukkueen luominen

#### Ensimmäinen joukkue (uusi käyttäjä)

1. Rekisteröidy sovellukseen
2. Mene **Asetukset** → **Luo uusi joukkue**
3. Täytä joukkueen tiedot:
   - Joukkueen nimi
   - Seuran nimi (valinnainen)
   - Kuvaus (valinnainen)
4. Paina **"Luo joukkue"**
5. Sinusta tulee automaattisesti joukkueen admin
6. **Tärkeää:** Joukkue tarvitsee lisenssin toimiakseen täysin. Ota yhteyttä MasterAdminiin lisenssin aktivoimiseksi.

#### Liittymiskoodin saaminen

Kun joukkue on luotu:

1. Mene **Asetukset**
2. Liittymiskoodi näkyy joukkueen tiedoissa
3. Jaa koodi pelaajille (esim. WhatsApp, sähköposti)

### Pelaajien hallinta

#### Pelaajan lisääminen manuaalisesti

1. Mene **Pelaajat**-näkymään
2. Paina **"+"** -painiketta
3. Täytä pelaajan tiedot:
   - Nimi (pakollinen)
   - Sähköposti (pakollinen, jos haluat luoda tilin)
   - Puhelinnumero (valinnainen)
   - Positiot (H, P, MV, H/P)
4. Paina **"Lisää pelaaja"**

**Huom:** Jos syötät sähköpostin, voit myöhemmin luoda pelaajalle kirjautumistunnukset Asetuksista.

#### Pelaajan muokkaaminen

1. Mene **Pelaajat**-näkymään
2. Paina pelaajan nimeä
3. Muokkaa tietoja
4. Paina **"Tallenna"**

#### Pelaajan poistaminen

1. Mene **Pelaajat**-näkymään
2. Paina pelaajan nimeä
3. Paina **"Poista pelaaja"**
4. Vahvista poisto

### Pelaajien kategorisointi

Kategoriointi on tärkeä osa tasapuolisten tiimien luomista. Jokaisella pelaajalla on:

#### Kategoria (1-3)

- **1** = Aloittelija / Vähemmän kokenut
- **2** = Keskitaso (oletus)
- **3** = Edistynyt / Kokenut pelaaja

#### Kerroin (1.0 - 3.0)

Hienosäätö pelaajan taitotasolle:

- **1.0** = Paras taitotaso
- **2.0** = Keskitaso (oletus)
- **3.0** = Aloittelija

**Kokonaisarvo lasketaan:** Kategoria × Kerroin

**Esimerkki:**

- Huippupelaaja: Kategoria 3, Kerroin 1.0 → Arvo: 3.0
- Keskitason pelaaja: Kategoria 2, Kerroin 2.0 → Arvo: 4.0
- Aloittelija: Kategoria 1, Kerroin 3.0 → Arvo: 3.0

#### Kategorioinnin muokkaaminen

1. Mene **Pelaajat**-näkymään
2. Valitse pelaaja
3. Säädä **Kategoria** ja **Kerroin** arvoja
4. Tallenna muutokset

**Vinkki:** Seuraa pelaajien suorituksia ja päivitä arvoja säännöllisesti tasapuolisten tiimien varmistamiseksi.

### Tapahtumien hallinta

#### Uuden tapahtuman luominen

1. Mene **Tapahtumat**-näkymään
2. Paina **"+"** tai **"Luo tapahtuma"**
3. Täytä tapahtuman tiedot:
   - **Nimi** (esim. "Keskiviikon treenit")
   - **Päivämäärä ja aika**
   - **Paikka**
   - **Maksimipelaajamäärä** (valinnainen)
   - **Maalivahtien määrä** (valinnainen)
   - **Kuvaus** (valinnainen)
4. Paina **"Luo tapahtuma"**

#### Tapahtuman muokkaaminen

1. Mene tapahtuman tietoihin
2. Paina **"Muokkaa"**
3. Tee muutokset
4. Tallenna

#### Pelaajien lisääminen tapahtumaan (admin)

1. Mene tapahtuman tietoihin
2. Paina **"Hallinnoi pelaajia"**
3. Valitse pelaajat listasta
4. Lisää valitut tapahtumaan

#### Toistuvat tapahtumat

Voit luoda toistuvia tapahtumia (esim. viikoittaiset treenit):

1. Luo tapahtuma normaalisti
2. Valitse **"Toistuva tapahtuma"**
3. Valitse toistuvuus (viikoittain, kuukausittain)
4. Valitse päättymispäivä

### Tiimien luonti tapahtumaan

#### Automaattinen tiimien jako

1. Mene tapahtumaan jossa on ilmoittautuneita pelaajia
2. Paina **"Luo tiimit"** tai **"Tiimien luonti"**
3. Sovellus jakaa pelaajat automaattisesti tasapuolisiin tiimeihin
   - Huomioi pelaajien kategoriat ja kertoimet
   - Jakaa maalivahdit tasaisesti
   - Pyrkii tasapuoliseen kokonaisarvoon molemmille tiimeille
4. Voit **sekoittaa tiimit** uudelleen painamalla "Sekoita"
5. Voit siirtää yksittäisiä pelaajia tiimien välillä manuaalisesti

#### Tiimien nimet

1. Mene **Asetukset**-näkymään
2. Voit muokata tiimien oletusnimiä:
   - Tiimi A:n nimi (esim. "Punaiset")
   - Tiimi B:n nimi (esim. "Siniset")
3. Nämä nimet näkyvät tiimien luonnissa

#### Tiimien jakaminen

Kun tiimit on luotu:

1. Paina **"Jaa tiimit"**
2. Valitse jakotapa:
   - WhatsApp
   - Sähköposti
   - Kopioi leikepöydälle
3. Tiimilista lähetetään pelaajille

### Käyttäjähallinta

#### Käyttäjien listaus

1. Mene **Asetukset** → **Käyttäjähallinta**
2. Näet kaikki joukkueen käyttäjät
3. Voit suodattaa:
   - Kaikki käyttäjät
   - Adminit
   - Käyttäjät ilman salasanaa

#### Admin-oikeuksien antaminen

1. Mene **Käyttäjähallinta**
2. Valitse käyttäjä
3. Ota käyttöön **"Admin"**-kytkin
4. Käyttäjä voi nyt hallita joukkuetta

#### Admin-oikeuksien poistaminen

1. Mene **Käyttäjähallinta**
2. Valitse admin-käyttäjä
3. Poista **"Admin"**-kytkin käytöstä

**Huom:** Et voi poistaa omia admin-oikeuksiasi.

#### Käyttäjän poistaminen

1. Mene **Käyttäjähallinta**
2. Valitse käyttäjä
3. Paina **"Poista käyttäjä"**
4. Vahvista poisto

### Liittymiskoodin jakaminen

Liittymiskoodi on 6-merkkinen koodi jolla uudet pelaajat voivat liittyä joukkueeseesi.

#### Koodin löytäminen

1. Mene **Asetukset**
2. Liittymiskoodi näkyy joukkueen tiedoissa
3. Voit kopioida koodin painamalla sitä

#### Koodin jakaminen

Jaa koodi pelaajille:

- **WhatsApp:** "Liity joukkueeseemme FairDealPro-sovelluksessa! Lataa sovellus ja käytä liittymiskoodia: XXXXXX"
- **Sähköposti:** Lähetä koodi sähköpostitse
- **Kasvokkain:** Näytä koodi puhelimestasi

#### Esimerkki viestipohjasta

```
Tervetuloa [Joukkueen nimi] -joukkueeseen! 🏒

1. Lataa FairDealPro-sovellus:
   - iOS: App Store
   - Android: Google Play

2. Rekisteröidy sovellukseen

3. Liity joukkueeseen koodilla: XXXXXX
   (Profiili → Liity joukkueeseen)

Nähdään kentällä! 🎉
```

### Salasanojen hallinta

Jos luot pelaajat manuaalisesti (ilman että he rekisteröityvät itse), sinun täytyy luoda heille kirjautumistunnukset.

#### Salasanojen luominen pelaajille

1. Mene **Asetukset** → **Käyttäjähallinta**
2. Valitse **"Käyttäjät ilman salasanaa"**
3. Valitse pelaajat joille haluat luoda tunnukset (checkbox)
4. Paina **"Luo salasanat valituille"**
5. Syötä yhteinen väliaikainen salasana (tai käytä oletusta)
6. Paina **"Luo"**
7. Jaa salasana pelaajille turvallisesti

#### Salasanan jakaminen

```
Hei [Pelaajan nimi]!

Sinulle on luotu FairDealPro-tili:
- Sähköposti: [pelaajan sähköposti]
- Salasana: [väliaikainen salasana]

Kirjaudu sovellukseen ja vaihda salasana omaksesi.

Lataa sovellus:
- iOS: App Store
- Android: Google Play
```

#### Tärkeää salasanoista

- Väliaikainen salasana on tarkoitettu vain ensimmäiseen kirjautumiseen
- Sovellus pyytää käyttäjää vaihtamaan salasanan ensimmäisellä kirjautumisella
- Älä jaa salasanoja julkisesti
- Käytä turvallisia kanavia (yksityisviestit, henkilökohtainen sähköposti)

---

## Usein kysytyt kysymykset (UKK)

### Miksi en näe joukkuettani?

- Varmista että olet kirjautunut oikealla tilillä
- Tarkista että olet liittynyt joukkueeseen liittymiskoodilla
- Jos admin loi tilisi, odota että hän on luonut salasanan

### Miksi en voi luoda tapahtumia?

- Vain adminit voivat luoda tapahtumia
- Pyydä joukkueen adminia antamaan sinulle admin-oikeudet

### Miksi tiimien jako ei toimi tasaisesti?

- Tarkista että pelaajien kategoriat ja kertoimet on asetettu oikein
- Mitä tarkemmat arvot, sitä tasaisempi jako

### Miten vaihdan joukkuetta?

- Voit kuulua useampaan joukkueeseen
- Vaihda aktiivista joukkuetta Profiili-näkymässä

### Miten poistan tilini?

- Ota yhteyttä joukkueen adminiin tai sovelluksen tukeen

---

## Tuki

Jos kohtaat ongelmia sovelluksen käytössä:

- Tarkista ensin tämä ohje
- Ota yhteyttä joukkueesi adminiin
- Lähetä palautetta sovelluksen kautta

---

_FairDealPro - Tasapuoliset tiimit, paremmat pelit!_
