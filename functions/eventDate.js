"use strict";

/**
 * Tapahtuman ajankohta. Kenttä on tietokannassa merkkijonona (osa vanhoista
 * riveistä lyhyessä paikallisajan muodossa, loput UTC-ISO:na), ei Timestampina.
 * Siksi aikarajausta EI voi tehdä Firestore-kyselyllä: where("date", ">=", Date)
 * ei kohtaa merkkijonokenttää lainkaan vaan palauttaa aina tyhjän tuloksen.
 * Kokoelma on pieni, joten rajaus tehdään täällä samalla tulkinnalla kuin
 * sovelluksessa.
 */
const eventDate = (data) => {
  const raw = data?.date;
  if (!raw) return null;

  if (raw?.toDate) {
    return raw.toDate();
  }

  // Local ISO strings such as "2026-09-18T16:00" have no timezone. Cloud
  // Functions runs in UTC, but the app stores and displays these as Helsinki
  // local time, so resolve the timezone before comparing registration limits.
  if (
    typeof raw === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(raw)
  ) {
    const localComponentsAsUtc = new Date(`${raw}Z`);
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Helsinki",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(localComponentsAsUtc);
    const value = (type) => parts.find((part) => part.type === type)?.value;
    const helsinkiOffset =
      Date.parse(
        `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}:${value("second")}Z`,
      ) - localComponentsAsUtc.getTime();
    const parsed = new Date(localComponentsAsUtc.getTime() - helsinkiOffset);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(raw);
  return isNaN(parsed.getTime()) ? null : parsed;
};

module.exports = { eventDate };
