// Sama logiikka kuin mobiilisovelluksen src/utils/skillStatus.ts:ssä – pidä ne samanlaisina.
/**
 * Joukkuekohtaisen taitotason tila.
 *
 * - "missing": taitotasoa ei ole tälle joukkueelle ja roolille (esim.
 *   pelaaja liittyi joukkueeseen liittymiskoodilla)
 * - "unrated": arvo on olemassa, mutta admin ei ole sitä arvioinut (luotu
 *   automaattisesti oletuksena). Merkitään roolin kentällä `unrated: true`.
 * - "rated": admin on asettanut tai hyväksynyt arvon. Vanhoilla arvoilla ei
 *   ole merkintää, joten ne lasketaan arvioiduiksi.
 */
export type SkillStatus = "rated" | "unrated" | "missing";
export type SkillRole = "field" | "goalkeeper";

export const DEFAULT_SKILL = { category: 2, multiplier: 2.0 };

type SkillHolder = {
  positions?: string[];
  teamSkills?: Record<string, any>;
};

/** Pelipaikkoja vastaavat roolit: kenttä (H/P) ja/tai maalivahti (MV) */
export const rolesForPositions = (positions?: string[]): SkillRole[] => {
  const roles: SkillRole[] = [];
  if (!positions?.length || positions.some((p) => p !== "MV")) {
    roles.push("field");
  }
  if (positions?.includes("MV")) {
    roles.push("goalkeeper");
  }
  return roles;
};

export const roleSkillStatus = (
  player: SkillHolder,
  teamId: string,
  role: SkillRole,
): SkillStatus => {
  const skills = player.teamSkills?.[teamId]?.[role];
  if (
    !skills ||
    typeof skills.category === "undefined" ||
    typeof skills.multiplier === "undefined"
  ) {
    return "missing";
  }
  return skills.unrated === true ? "unrated" : "rated";
};

/**
 * Pelaajan taitotason tila joukkueessa. Ilman roolia tarkistetaan kaikki
 * pelipaikkoja vastaavat roolit ja palautetaan huonoin tila.
 */
export const skillStatus = (
  player: SkillHolder,
  teamId: string,
  role?: SkillRole,
): SkillStatus => {
  const statuses = (role ? [role] : rolesForPositions(player.positions)).map(
    (r) => roleSkillStatus(player, teamId, r),
  );
  if (statuses.includes("missing")) return "missing";
  if (statuses.includes("unrated")) return "unrated";
  return "rated";
};
