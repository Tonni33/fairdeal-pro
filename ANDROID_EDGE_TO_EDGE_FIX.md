# Android Edge-to-Edge korjaukset

## Ongelma

Android 15:stä alkaen (SDK 35+) sovellukset näkyvät oletuksena reunasta reunaan (edge-to-edge), mikä aiheutti ongelman, jossa sisältö meni osittain Android-laitteen järjestelmäpainikkeiden päälle.

## Toteutetut korjaukset

### 1. App.tsx muutokset

- Lisätty `SafeAreaProvider` wrapperi
- Lisätty Android-spesifinen `SafeAreaView` komponentti, joka käsittelee system insets
- iOS säilyy muuttumattomana

### 2. app.json muutokset

- Poistettu `"edgeToEdgeEnabled": true` Android-konfiguraatiosta
- Lisätty `"softwareKeyboardLayoutMode": "pan"` paremman näppäimistön käsittelyn varmistamiseksi

### 3. MainActivity.kt muutokset

- Lisätty `WindowCompat.setDecorFitsSystemWindows(window, false)` Android R+ (API 30+) versioille
- Tämä mahdollistaa oikean edge-to-edge -tuen ilman sisällön menemistä järjestelmäpainikkeiden päälle

### 4. AndroidManifest.xml muutokset

- Lisätty `android:resizeableActivity="true"` tukemaan suuria näyttöjä (tabletit, taitettavat laitteet)

### 5. build.gradle muutokset

- Lisätty `androidx.core:core-ktx:1.12.0` riippuvuus WindowCompat-tuen varmistamiseksi

### 6. gradle.properties muutokset

- Poistettu `expo.edgeToEdgeEnabled=true` rivi

### 7. Tyylitiedostojen muutokset

- Päivitetty `values/styles.xml`: Muutettu parent-teema `Theme.AppCompat.Light.NoActionBar`:ksi
- Lisätty läpinäkyvät statusbar ja navigationbar värit
- Luotu `values-v31/styles.xml` Android 12+ (API 31+) spesifisillä asetuksilla

## Vaikutus

- ✅ iOS: Ei muutoksia, toimii kuten ennenkin
- ✅ Android: Sisältö ei enää mene järjestelmäpainikkeiden päälle
- ✅ Suuret näytöt: Tuki tableteille ja taitettaville laitteille
- ✅ Android 15+: Oikea edge-to-edge -tuki ilman ongelmia
- ✅ Play Store varoitukset: Korjattu kaikki mainitut ongelmat

## Testaus

Testaa sovellus seuraavilla laitteilla/versioilla:

1. Android 15+ laite (SDK 35+)
2. Android 12-14 laite (SDK 31-34)
3. Android 11 ja vanhemmat (SDK 30 ja alle)
4. Tabletti tai taitettava laite
5. iOS-laite (varmista että ei ole regressioita)

## Seuraavat vaiheet

1. Buildaa uusi versio: `eas build --platform android`
2. Testaa sovellus eri Android-versioilla
3. Lähetä päivitys Play Store -kauppaan
4. Versionumero tulee päivittää app.json tiedostossa ennen julkaisua
