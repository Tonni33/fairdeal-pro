/**
 * Lisäpelaajat: pelaaja, joka ilmoittautuu kuten muut mutta ei vie paikkaa
 * eikä ole mukana joukkueiden tasapainotuksessa. Merkintä on pelaajalla
 * joukkuekohtaisesti (extraPlayer[teamId]), ja tapahtuma listaa
 * ilmoittautuneet lisäpelaajat (extraPlayerIds). Jokainen lisäpelaaja
 * kasvattaa kenttäpelaajien enimmäismäärää yhdellä, esim. 20/20 → 21/21.
 *
 * Firestoren säännöt ja palvelimen nostofunktio noudattavat samaa sääntöä.
 */
export const MAX_EXTRA_PLAYERS = 2;

type ExtraHolder = { extraPlayer?: Record<string, boolean> } | null | undefined;
type EventLike =
  | {
      registeredPlayers?: string[];
      extraPlayerIds?: string[];
      maxPlayers?: number;
    }
  | null
  | undefined;

export const isTeamExtraPlayer = (
  player: ExtraHolder,
  teamId?: string,
): boolean => !!teamId && player?.extraPlayer?.[teamId] === true;

/** Tapahtumaan ilmoittautuneet lisäpelaajat (enintään MAX_EXTRA_PLAYERS) */
export const eventExtraPlayerIds = (event: EventLike): string[] =>
  (event?.extraPlayerIds || [])
    .filter((id) => event?.registeredPlayers?.includes(id))
    .slice(0, MAX_EXTRA_PLAYERS);

/** Kenttäpelaajien enimmäismäärä lisäpelaajat mukaan lukien */
export const fieldPlayerLimit = (event: EventLike): number | undefined =>
  typeof event?.maxPlayers === "number"
    ? event.maxPlayers + eventExtraPlayerIds(event).length
    : event?.maxPlayers;
