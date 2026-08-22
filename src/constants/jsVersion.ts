/**
 * JS-päivityksen juokseva versionumero.
 *
 * EAS-päivityksillä ei ole ihmisluettavaa versiota, ja laite raportoi eri
 * tunnisteen kuin mitä julkaisukomento palauttaa. Siksi numero kuljetetaan
 * nipun mukana: laite kertoo suoraan oman versionsa eikä sitä tarvitse
 * päätellä aikaleimoista.
 *
 * scripts/publishUpdate.js kasvattaa tätä ennen julkaisua ja kirjaa saman
 * numeron Firestoreen, joten hallintanäkymä vertaa numeroa numeroon.
 */
export const JS_VERSION = 3;
