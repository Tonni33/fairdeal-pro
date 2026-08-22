#!/usr/bin/env node
/**
 * Julkaisee JS-päivityksen ja kirjaa sen Firestoreen.
 *
 *   node scripts/publishUpdate.js "Mitä muuttui"
 *   node scripts/publishUpdate.js --record-only
 *
 * Ilman tätä web-hallinta joutuu päättelemään uusimman version siitä, mitä
 * käyttäjien laitteet ovat raportoineet – eli uusi julkaisu näkyy vasta kun
 * joku on ottanut sen käyttöön. Kirjaus tekee vertailukohdasta täsmällisen.
 *
 * Kirjoittaa dokumenttiin settings/app.
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const JS_VERSION_FILE = path.join(__dirname, "..", "src", "constants", "jsVersion.ts");

const readJsVersion = () => {
  const match = fs
    .readFileSync(JS_VERSION_FILE, "utf8")
    .match(/export const JS_VERSION = (\d+);/);
  if (!match) {
    throw new Error("JS_VERSION-vakiota ei löytynyt tiedostosta " + JS_VERSION_FILE);
  }
  return Number(match[1]);
};

const writeJsVersion = (value) => {
  const contents = fs.readFileSync(JS_VERSION_FILE, "utf8");
  fs.writeFileSync(
    JS_VERSION_FILE,
    contents.replace(/export const JS_VERSION = \d+;/, `export const JS_VERSION = ${value};`)
  );
};

const BRANCH = "production";
const args = process.argv.slice(2);
const recordOnly = args.includes("--record-only");
const message = args.filter((a) => !a.startsWith("--")).join(" ");

if (!recordOnly && !message) {
  console.error(
    'Anna julkaisuviesti: node scripts/publishUpdate.js "Mitä muuttui"'
  );
  process.exit(1);
}

const eas = (easArgs) =>
  execFileSync("npx", ["--yes", "eas-cli@latest", ...easArgs], {
    encoding: "utf8",
    stdio: ["inherit", "pipe", "inherit"],
  });

let jsVersion = readJsVersion();

if (!recordOnly) {
  // Numero kasvatetaan ENNEN julkaisua, jotta se päätyy julkaistavaan nippuun
  jsVersion += 1;
  writeJsVersion(jsVersion);
  console.log(`\n▶ Julkaistaan JS-versio ${jsVersion} haaraan ${BRANCH}...\n`);
  const output = eas([
    "update",
    "--branch",
    BRANCH,
    "--message",
    message,
    "--non-interactive",
  ]);
  console.log(output);
}

console.log("▶ Luetaan julkaisun tiedot...");
const listed = JSON.parse(
  eas([
    "update:list",
    "--branch",
    BRANCH,
    "--limit",
    "1",
    "--json",
    "--non-interactive",
  ])
);
const latest = listed?.currentPage?.[0];
if (!latest) {
  console.error("Haaralta ei löytynyt yhtään julkaisua");
  process.exit(1);
}

// eas update:list liittää viestiin "(just now by kuka)" tai "(3 minutes ago
// by kuka)" ja ympäröi sen lainausmerkeillä – siivotaan molemmat pois
const cleanMessage = String(latest.message || "")
  .replace(/\s*\([^()]*\bby\s+[^()]*\)\s*$/, "")
  .replace(/^"(.*)"$/s, "$1")
  .trim();

admin.initializeApp({
  credential: admin.credential.cert(
    require("../fairdeal-pro-firebase-adminsdk.json")
  ),
});

(async () => {
  await admin
    .firestore()
    .collection("settings")
    .doc("app")
    .set(
      {
        latestRuntimeVersion: latest.runtimeVersion || null,
        latestJsVersion: jsVersion,
        latestUpdateGroup: latest.group || null,
        latestUpdateMessage: cleanMessage || null,
        latestUpdatePlatforms: latest.platforms || null,
        // Kirjataan kirjaushetki: skripti ajetaan heti julkaisun perään, joten
        // ero todelliseen julkaisuaikaan on sekunteja.
        latestUpdatePublishedAt: new Date(),
        recordedAt: new Date(),
      },
      { merge: true }
    );

  console.log("\n✓ Kirjattu Firestoreen (settings/app)");
  console.log(`  JS-versio:      ${jsVersion}`);
  console.log(`  runtimeVersion: ${latest.runtimeVersion}`);
  console.log(`  update group:   ${latest.group}`);
  console.log(`  viesti:         ${cleanMessage}`);
  if (!recordOnly) {
    console.log("\n  Muista committoida src/constants/jsVersion.ts");
  }
  process.exit(0);
})().catch((error) => {
  console.error("Kirjaus epäonnistui:", error);
  process.exit(1);
});
