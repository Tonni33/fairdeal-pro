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
const admin = require("firebase-admin");

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

if (!recordOnly) {
  console.log(`\n▶ Julkaistaan päivitys haaraan ${BRANCH}...\n`);
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

// eas update:list liittää viestiin "(x minutes ago by kuka)" – siivotaan pois
const cleanMessage = String(latest.message || "")
  .replace(/\s*\((?:[^()]*ago[^()]*)\)\s*$/, "")
  .replace(/^"|"$/g, "");

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
  console.log(`  runtimeVersion: ${latest.runtimeVersion}`);
  console.log(`  update group:   ${latest.group}`);
  console.log(`  viesti:         ${cleanMessage}`);
  process.exit(0);
})().catch((error) => {
  console.error("Kirjaus epäonnistui:", error);
  process.exit(1);
});
