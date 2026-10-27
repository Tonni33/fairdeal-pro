import type {
  EnrichedPlayer,
  Team,
  GeneratedTeamData,
  TeamGenerationOptions,
  TeamBalanceResult,
  BalanceTraceStep,
  BalanceTracePlayer,
} from "../types";

// Kuinka monta arvontaa tehdään, ja kuinka paljon valitun arvonnan
// vahvuusero saa poiketa tasaisimmasta (prosenttia kentällisen vahvuudesta).
// Valinta tehdään satunnaisesti kaikista riittävän tasaisista eri
// kokoonpanoista, jotta joukkueet vaihtelevat kerrasta toiseen.
// Valinta tehdään satunnaisesti parhaiden joukosta, jotta joukkueet
// vaihtelevat kerrasta toiseen.
const CANDIDATE_DRAWS = 100;
const TOLERANCE_PERCENT = 1;

// Jäällä kerrallaan: 2 puolustajaa ja 3 hyökkääjää
const DEFENDER_SLOTS = 2;
const ATTACKER_SLOTS = 3;

// Ykkösketjun (kaksi parasta puolustajaa ja kolme parasta hyökkääjää) paino
// tasapainossa. Pelkkä keskiarvo salli parhaiden pelaajien kasautumisen
// samaan joukkueeseen, kun vastapainoksi annettiin heikompia.
const FIRST_LINE_WEIGHT = 0.5;

/**
 * Team balancing algorithm that creates balanced teams based on player skills
 */
export class TeamBalancer {
  // Pelipaikkaperusteisessa arvonnassa pelaajilla on rooli (puolustaja /
  // hyökkääjä), ja vahvuus lasketaan roolien jääajalla. Taitotasoarvonnassa
  // rooleja ei ole. Asetetaan jokaisen arvonnan alussa; koodi on synkronista.
  private static positionMode = false;

  // Käynnissä olevan arvonnan kulku (ks. BalanceTraceStep)
  private static trace: BalanceTraceStep[] = [];

  /**
   * Generate balanced teams from a list of players using random category-based distribution
   *
   * Arpoo joukkueet nykyisillä säännöillä useaan kertaan ja valitsee
   * satunnaisesti yhden tasaisimmista. Säännöt (puolustajien jako, huonoin
   * puolustaja täydelle puolelle, Cat 1 ±1, maalivahdit) pätevät jokaisessa
   * arvonnassa; vertailu kertoo vain, mikä niistä on jäällä tasaisin.
   */
  static generateBalancedTeams(
    players: EnrichedPlayer[], // Use EnrichedPlayer with computed fields
    options: TeamGenerationOptions,
    teamAName: string = "Joukkue A",
    teamBName: string = "Joukkue B",
  ): TeamBalanceResult {
    const originalLog = console.log;
    const candidates: {
      result: TeamBalanceResult;
      logs: unknown[][];
      difference: number;
    }[] = [];

    for (let i = 0; i < CANDIDATE_DRAWS; i++) {
      // Jokainen arvonta saa omat kopiot: algoritmi merkitsee pelaajiin
      // roolin (assignedRole), eikä edellinen arvonta saa vaikuttaa siihen
      const freshPlayers = players.map((p) => ({ ...p }));
      const logs: unknown[][] = [];
      console.log = (...args: unknown[]) => {
        logs.push(args);
      };
      try {
        const result = this.generateOnce(
          freshPlayers,
          options,
          teamAName,
          teamBName,
        );
        candidates.push({
          result,
          logs,
          difference: this.strengthDifference(result.teams),
        });
      } finally {
        console.log = originalLog;
      }
    }

    candidates.sort((a, b) => a.difference - b.difference);

    // Sama kokoonpano syntyy usein monesta arvonnasta, joten valitaan eri
    // kokoonpanojen joukosta. Hyväksytään kaikki, joiden ero on enintään
    // TOLERANCE_PERCENT kentällisen vahvuudesta (tai tasaisin, jos sekin on
    // suurempi).
    const meanStrength =
      candidates[0].result.teams.reduce(
        (sum, team) => sum + this.fieldStrength(team),
        0,
      ) / Math.max(candidates[0].result.teams.length, 1);
    const tolerance = Math.max(
      candidates[0].difference,
      (meanStrength * TOLERANCE_PERCENT) / 100,
    );
    const compositionKey = (result: TeamBalanceResult) =>
      result.teams
        .map((team) =>
          team.players
            .map((p) => p.id)
            .sort()
            .join(","),
        )
        .sort()
        .join("|");
    const seen = new Set<string>();
    const top = candidates.filter((candidate) => {
      if (candidate.difference > tolerance) return false;
      const key = compositionKey(candidate.result);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const chosen = top[Math.floor(Math.random() * top.length)];

    // Valitun arvonnan loki näytetään sellaisenaan
    chosen.logs.forEach((args) => console.log(...args));
    console.log(
      `🏆 Selected draw: difference (on-ice + first line) ${chosen.difference.toFixed(3)}, ` +
        `chosen at random from ${top.length} distinct line-ups within ${tolerance.toFixed(3)} ` +
        `(best ${candidates[0].difference.toFixed(3)}, median ${candidates[
          Math.floor(candidates.length / 2)
        ].difference.toFixed(3)}, worst ${candidates[
          candidates.length - 1
        ].difference.toFixed(3)} of ${candidates.length} draws)`,
    );

    return chosen.result;
  }

  /**
   * Yksi arvonta nykyisillä säännöillä
   */
  private static generateOnce(
    players: EnrichedPlayer[],
    options: TeamGenerationOptions,
    teamAName: string,
    teamBName: string,
  ): TeamBalanceResult {
    console.log(
      "🎲 TEAMBALANCER: Starting team generation with method:",
      options.distributionMethod || "skill-based (default)",
    );

    this.trace = [];
    this.positionMode = options.distributionMethod === "position-based";

    // Lisäpelaajat eivät ole mukana varsinaisessa jaossa
    const extras = players.filter((p) => p.isExtra);
    const regularPlayers = players.filter((p) => !p.isExtra);

    // Check distribution method
    const result = this.positionMode
      ? this.generateByPosition(regularPlayers, options, teamAName, teamBName)
      : this.generateBySkill(regularPlayers, options, teamAName, teamBName);
    console.log(
      this.positionMode
        ? "✅ Used POSITION-BASED distribution"
        : "✅ Used SKILL-BASED distribution",
    );

    // Hionta ja maalivahtisäännön tarkistus, sitten luvut uudelleen
    this.refineTeams(result.teams);
    this.enforceGoalkeeperRule(result.teams);
    result.teams.forEach((team) => {
      team.totalPoints = team.players.reduce(
        (sum, player) => sum + (player.points || 0),
        0,
      );
    });
    result.balanceScore = this.calculateBalanceScore(result.teams);

    // Lopuksi kukin lisäpelaaja joukkueeseen, jossa on vähemmän
    // kenttäpelaajia; tasatilanteessa arvotaan
    if (result.teams.length === 2) {
      const skaterCount = (team: GeneratedTeamData) =>
        team.players.filter((p) => p.position !== "MV").length;
      for (const extra of extras) {
        const [teamA, teamB] = result.teams;
        const target =
          skaterCount(teamA) !== skaterCount(teamB)
            ? skaterCount(teamA) < skaterCount(teamB)
              ? teamA
              : teamB
            : Math.random() < 0.5
              ? teamA
              : teamB;
        this.addPlayerToTeam(target, extra);
        this.trace.push({
          kind: "single",
          role: "extra",
          player: this.tracePlayer(extra),
          team: target.name,
        });
        console.log(
          `Extra player: ${extra.name} → ${target.name} (fewer field players or random)`,
        );
      }
    }

    return { ...result, trace: this.trace };
  }

  private static isDefender(player: EnrichedPlayer): boolean {
    return (
      player.position === "P" || (player as any).assignedRole === "defender"
    );
  }

  /**
   * Kenttäpelaajien vahvuus jääajalla painotettuna: keskimääräinen kentällinen
   * jäällä (pienempi = vahvempi). Jäällä on kerrallaan 2 puolustajaa ja 3
   * hyökkääjää, joten vajaan puolen pelaajat ovat jäällä useammin ja painavat
   * enemmän. Maalivahdit eivät ole mukana: ne jaetaan erikseen.
   *
   * Taitotasoarvonnassa, tai kun toista roolia ei vielä ole, kaikki
   * kenttäpelaajat jakavat viisi paikkaa tasan.
   */
  private static fieldStrength(
    team: GeneratedTeamData,
    extraPlayer?: EnrichedPlayer,
  ): number {
    // Lisäpelaajat eivät kuulu vahvuuteen
    const skaters = [
      ...team.players.filter((p) => p.position !== "MV" && !p.isExtra),
      ...(extraPlayer ? [extraPlayer] : []),
    ];
    if (skaters.length === 0) return 0;

    const sum = (list: EnrichedPlayer[]) =>
      list.reduce((total, p) => total + p.multiplier, 0);
    const defenders = skaters.filter((p) => this.isDefender(p));
    const attackers = skaters.filter((p) => !this.isDefender(p));

    if (
      !this.positionMode ||
      defenders.length === 0 ||
      attackers.length === 0
    ) {
      return (
        (sum(skaters) / skaters.length) * (DEFENDER_SLOTS + ATTACKER_SLOTS)
      );
    }
    return (
      (sum(defenders) / defenders.length) * DEFENDER_SLOTS +
      (sum(attackers) / attackers.length) * ATTACKER_SLOTS
    );
  }

  /**
   * Ykkösketjun vahvuus: kaksi parasta puolustajaa ja kolme parasta
   * hyökkääjää (taitotasoarvonnassa viisi parasta kenttäpelaajaa).
   */
  private static firstLineStrength(team: GeneratedTeamData): number {
    const skaters = team.players.filter(
      (p) => p.position !== "MV" && !p.isExtra,
    );
    if (skaters.length === 0) return 0;
    const bestAverage = (list: EnrichedPlayer[], count: number) => {
      const best = list
        .map((p) => p.multiplier)
        .sort((a, b) => a - b)
        .slice(0, count);
      return best.reduce((total, m) => total + m, 0) / best.length;
    };
    const defenders = skaters.filter((p) => this.isDefender(p));
    const attackers = skaters.filter((p) => !this.isDefender(p));
    if (
      !this.positionMode ||
      defenders.length === 0 ||
      attackers.length === 0
    ) {
      return (
        bestAverage(skaters, DEFENDER_SLOTS + ATTACKER_SLOTS) *
        (DEFENDER_SLOTS + ATTACKER_SLOTS)
      );
    }
    return (
      bestAverage(defenders, DEFENDER_SLOTS) * DEFENDER_SLOTS +
      bestAverage(attackers, ATTACKER_SLOTS) * ATTACKER_SLOTS
    );
  }

  /**
   * Joukkueiden ero: kokonaisvahvuuden ero + painotettu ykkösketjujen ero.
   * Pienempi = tasaisempi.
   */
  private static strengthDifference(teams: GeneratedTeamData[]): number {
    if (teams.length < 2) return 0;
    return (
      Math.abs(this.fieldStrength(teams[0]) - this.fieldStrength(teams[1])) +
      FIRST_LINE_WEIGHT *
        Math.abs(
          this.firstLineStrength(teams[0]) - this.firstLineStrength(teams[1]),
        )
    );
  }

  private static replacePlayer(
    team: GeneratedTeamData,
    out: EnrichedPlayer,
    incoming: EnrichedPlayer,
  ): void {
    team.players = team.players.map((p) => (p.id === out.id ? incoming : p));
    if (team.fieldPlayers) {
      team.fieldPlayers = team.fieldPlayers.map((p) =>
        p.id === out.id ? incoming : p,
      );
    }
    if (team.goalkeepers) {
      team.goalkeepers = team.goalkeepers.map((p) =>
        p.id === out.id ? incoming : p,
      );
    }
  }

  /**
   * Hionta jaon jälkeen: vaihdetaan saman roolin pelaajia joukkueesta
   * toiseen niin kauan kuin ero (kokonaisuus + ykkösketju) pienenee.
   * Puolustajia, maalivahteja ja lisäpelaajia ei siirretä (puolustajajako ja
   * huonoimman puolustajan paikka pysyvät), ja Cat 1 -ero pysyy enintään 1.
   */
  private static refineTeams(teams: GeneratedTeamData[]): void {
    if (teams.length !== 2) return;
    const [teamA, teamB] = teams;
    const movable = (p: EnrichedPlayer) =>
      p.position !== "MV" && !p.isExtra && !this.isDefender(p);
    const fixedSkaters = (team: GeneratedTeamData) =>
      team.players.filter(
        (p) => p.position !== "MV" && !p.isExtra && this.isDefender(p),
      );

    // Vaihdot koskevat vain siirrettäviä pelaajia, joten muiden osuus
    // lasketaan kerran ja vaihtoja arvioidaan pelkillä kertoimilla
    const fixedA = fixedSkaters(teamA).map((p) => p.multiplier);
    const fixedB = fixedSkaters(teamB).map((p) => p.multiplier);
    const fixedCat1A = fixedSkaters(teamA).filter(
      (p) => p.category === 1,
    ).length;
    const fixedCat1B = fixedSkaters(teamB).filter(
      (p) => p.category === 1,
    ).length;
    const movA = teamA.players.filter(movable);
    const movB = teamB.players.filter(movable);

    const average = (values: number[]) =>
      values.reduce((total, v) => total + v, 0) / values.length;
    const bestAverage = (values: number[], count: number) =>
      average([...values].sort((a, b) => a - b).slice(0, count));
    const scores = (fixed: number[], moving: number[]) => {
      if (!this.positionMode || fixed.length === 0 || moving.length === 0) {
        const all = [...fixed, ...moving];
        const slots = DEFENDER_SLOTS + ATTACKER_SLOTS;
        return all.length === 0
          ? { all: 0, line: 0 }
          : {
              all: average(all) * slots,
              line: bestAverage(all, slots) * slots,
            };
      }
      return {
        all: average(fixed) * DEFENDER_SLOTS + average(moving) * ATTACKER_SLOTS,
        line:
          bestAverage(fixed, DEFENDER_SLOTS) * DEFENDER_SLOTS +
          bestAverage(moving, ATTACKER_SLOTS) * ATTACKER_SLOTS,
      };
    };
    const difference = (movingA: number[], movingB: number[]) => {
      const a = scores(fixedA, movingA);
      const b = scores(fixedB, movingB);
      return (
        Math.abs(a.all - b.all) + FIRST_LINE_WEIGHT * Math.abs(a.line - b.line)
      );
    };
    const cat1 = (list: EnrichedPlayer[]) =>
      list.filter((p) => p.category === 1).length;

    let current = difference(
      movA.map((p) => p.multiplier),
      movB.map((p) => p.multiplier),
    );
    for (let round = 0; round < 50; round++) {
      let best: { i: number; j: number; difference: number } | null = null;
      const multA = movA.map((p) => p.multiplier);
      const multB = movB.map((p) => p.multiplier);
      const cat1A = fixedCat1A + cat1(movA);
      const cat1B = fixedCat1B + cat1(movB);
      for (let i = 0; i < movA.length; i++) {
        for (let j = 0; j < movB.length; j++) {
          const a = movA[i];
          const b = movB[j];
          if (a.multiplier === b.multiplier) continue;
          const shift = (a.category === 1 ? 1 : 0) - (b.category === 1 ? 1 : 0);
          if (Math.abs(cat1A - shift - (cat1B + shift)) > 1) continue;
          const nextA = [...multA];
          const nextB = [...multB];
          nextA[i] = b.multiplier;
          nextB[j] = a.multiplier;
          const d = difference(nextA, nextB);
          if (d < current - 1e-9 && (!best || d < best.difference)) {
            best = { i, j, difference: d };
          }
        }
      }
      if (!best) break;
      const a = movA[best.i];
      const b = movB[best.j];
      movA[best.i] = b;
      movB[best.j] = a;
      this.replacePlayer(teamA, a, b);
      this.replacePlayer(teamB, b, a);
      current = best.difference;
      this.trace.push({
        kind: "swap",
        first: this.tracePlayer(a),
        firstTeam: teamB.name,
        second: this.tracePlayer(b),
        secondTeam: teamA.name,
      });
      console.log(
        `🔁 Refine: swapping ${a.name} (${teamA.name}) ↔ ${b.name} (${teamB.name}), difference ${current.toFixed(3)}`,
      );
    }
  }

  /**
   * Hionta voi muuttaa sitä, kumpi joukkue on kenttäpelaajiltaan heikompi.
   * Parempi maalivahti kuuluu heikommalle, joten tarvittaessa vaihdetaan.
   */
  private static enforceGoalkeeperRule(teams: GeneratedTeamData[]): void {
    if (teams.length !== 2) return;
    const [teamA, teamB] = teams;
    const gkA = teamA.players.filter((p) => p.position === "MV");
    const gkB = teamB.players.filter((p) => p.position === "MV");
    if (gkA.length !== 1 || gkB.length !== 1) return;
    const aIsWeaker = this.fieldStrength(teamA) >= this.fieldStrength(teamB);
    const weakerGk = aIsWeaker ? gkA[0] : gkB[0];
    const strongerGk = aIsWeaker ? gkB[0] : gkA[0];
    if (weakerGk.multiplier <= strongerGk.multiplier) return;

    this.replacePlayer(teamA, gkA[0], gkB[0]);
    this.replacePlayer(teamB, gkB[0], gkA[0]);
    this.trace.push({
      kind: "swap",
      first: this.tracePlayer(gkA[0]),
      firstTeam: teamB.name,
      second: this.tracePlayer(gkB[0]),
      secondTeam: teamA.name,
    });
    console.log(
      `🔁 Goalkeepers swapped after refinement: better goalkeeper to the weaker team`,
    );
  }

  private static tracePlayer(player: EnrichedPlayer): BalanceTracePlayer {
    return {
      id: player.id,
      name: player.name,
      position: player.position,
      category: player.category,
      multiplier: player.multiplier,
    };
  }

  /**
   * Generate balanced teams using SKILL-BASED distribution (original method)
   */
  private static generateBySkill(
    players: EnrichedPlayer[],
    options: TeamGenerationOptions,
    teamAName: string,
    teamBName: string,
  ): TeamBalanceResult {
    // All players passed to this function are already filtered to be active
    const activePlayers = players;

    if (activePlayers.length === 0) {
      return {
        teams: [],
        balanceScore: 0,
        unusedPlayers: [],
        warnings: ["No active players available"],
      };
    }

    // Separate goalkeepers and field players
    const goalkeepers = activePlayers.filter((p) => p.position === "MV");
    const fieldPlayers = activePlayers.filter((p) =>
      ["H", "P", "H/P"].includes(p.position),
    );

    // Always create exactly 2 teams
    const teams: GeneratedTeamData[] = [
      {
        id: "team-A",
        name: teamAName,
        adminId: "",
        adminIds: [],
        createdAt: new Date(),
        players: [],
        totalPoints: 0,
        goalkeepers: [],
        fieldPlayers: [],
      },
      {
        id: "team-B",
        name: teamBName,
        adminId: "",
        adminIds: [],
        createdAt: new Date(),
        players: [],
        totalPoints: 0,
        goalkeepers: [],
        fieldPlayers: [],
      },
    ];

    const warnings: string[] = [];

    // Use new random category-based distribution
    this.distributePlayersByCategory(teams, fieldPlayers, warnings);

    // Distribute goalkeepers to weaker team
    this.distributeGoalkeepersByBalance(teams, goalkeepers, warnings);

    // Ensure final category 1 counts are within 1 between teams
    this.rebalanceCategory1Players(teams);

    // Calculate final team stats
    teams.forEach((team) => {
      team.totalPoints = team.players.reduce(
        (sum, player) => sum + (player.points || 0),
        0,
      );
    });

    // Calculate balance score
    const balanceScore = this.calculateBalanceScore(teams);

    // Find unused players
    const usedPlayerIds = new Set(
      teams.flatMap((team) => team.players.map((p) => p.id)),
    );
    const unusedPlayers = activePlayers.filter((p) => !usedPlayerIds.has(p.id));

    return {
      teams,
      balanceScore,
      unusedPlayers,
      warnings,
    };
  }

  /**
   * Distribute field players by category using improved random balanced approach
   */
  private static distributePlayersByCategory(
    teams: GeneratedTeamData[],
    fieldPlayers: EnrichedPlayer[],
    warnings: string[],
  ): void {
    // Separate players by category (1-3)
    let category1 = fieldPlayers.filter((p) => p.category === 1);
    let category2 = fieldPlayers.filter((p) => p.category === 2);
    let category3 = fieldPlayers.filter((p) => p.category === 3);

    console.log("Category distribution:", {
      cat1: category1.length,
      cat2: category2.length,
      cat3: category3.length,
    });

    // Process Category 1 players
    category2 = this.processCategoryWithPairing(
      teams,
      category1,
      category2,
      1,
      warnings,
    );

    // Process Category 2 players (with remaining players)
    category3 = this.processCategoryWithPairing(
      teams,
      category2,
      category3,
      2,
      warnings,
    );

    // Process remaining Category 3 players
    this.processCategoryWithPairing(teams, category3, [], 3, warnings);
  }

  /**
   * Process players from a specific category with improved pairing logic
   * Returns the updated next category array (with used players removed)
   */
  private static processCategoryWithPairing(
    teams: GeneratedTeamData[],
    currentCategoryPlayers: EnrichedPlayer[],
    nextCategoryPlayers: EnrichedPlayer[],
    categoryNum: number,
    warnings: string[],
  ): EnrichedPlayer[] {
    if (currentCategoryPlayers.length === 0) return nextCategoryPlayers;

    let playersToProcess = [...currentCategoryPlayers];
    let remainingNextCategory = [...nextCategoryPlayers];

    // If odd number of players, pair with best player from next category
    if (playersToProcess.length % 2 === 1 && remainingNextCategory.length > 0) {
      const bestNextPlayer = this.getBestPlayerFromCategory(
        remainingNextCategory,
      );
      if (bestNextPlayer) {
        playersToProcess.push(bestNextPlayer);
        // Remove the used player from next category
        remainingNextCategory = remainingNextCategory.filter(
          (p) => p.id !== bestNextPlayer.id,
        );
        console.log(
          `Category ${categoryNum}: Added best Category ${
            categoryNum + 1
          } player (${bestNextPlayer.name}) to make even pairs`,
        );
      }
    }

    // Process players in pairs
    while (playersToProcess.length >= 2) {
      // Randomly select 2 players from remaining
      const randomIndices = this.selectTwoRandomIndices(
        playersToProcess.length,
      );
      const player1 = playersToProcess[randomIndices[0]];
      const player2 = playersToProcess[randomIndices[1]];

      // Remove selected players from array (remove in reverse order to maintain indices)
      playersToProcess.splice(Math.max(randomIndices[0], randomIndices[1]), 1);
      playersToProcess.splice(Math.min(randomIndices[0], randomIndices[1]), 1);

      // Determine which player is better (lower multiplier = better)
      // If multipliers are equal, randomly assign who is "better" to ensure fair distribution
      let betterPlayer: EnrichedPlayer;
      let worsePlayer: EnrichedPlayer;

      if (player1.multiplier < player2.multiplier) {
        betterPlayer = player1;
        worsePlayer = player2;
      } else if (player2.multiplier < player1.multiplier) {
        betterPlayer = player2;
        worsePlayer = player1;
      } else {
        // Equal multipliers - randomly decide who goes to which team
        if (Math.random() < 0.5) {
          betterPlayer = player1;
          worsePlayer = player2;
          console.log(
            `🎲 Equal multipliers (${player1.multiplier.toFixed(3)}): Randomly assigned ${player1.name} as "better", ${player2.name} as "worse"`,
          );
        } else {
          betterPlayer = player2;
          worsePlayer = player1;
          console.log(
            `🎲 Equal multipliers (${player1.multiplier.toFixed(3)}): Randomly assigned ${player2.name} as "better", ${player1.name} as "worse"`,
          );
        }
      }

      // For category 1 players, prioritize balancing the COUNT of cat1 players
      // For other categories, use team average
      let targetTeamForBetter: GeneratedTeamData;
      let targetTeamForWorse: GeneratedTeamData;

      if (categoryNum === 1) {
        // Category 1: Balance by COUNT of category 1 players
        const teamA_cat1Count = this.countCategory1Players(teams[0]);
        const teamB_cat1Count = this.countCategory1Players(teams[1]);

        console.log(
          `Category 1 balance check: Team A has ${teamA_cat1Count} cat1, Team B has ${teamB_cat1Count} cat1`,
        );

        if (teamA_cat1Count > teamB_cat1Count) {
          // Team A has more cat1 players, give better player to Team B
          targetTeamForBetter = teams[1];
          targetTeamForWorse = teams[0];
          console.log(
            `Category ${categoryNum}: Better player (${betterPlayer.name}) → Team B (fewer cat1: ${teamB_cat1Count} vs ${teamA_cat1Count}), Worse player (${worsePlayer.name}) → Team A`,
          );
        } else if (teamB_cat1Count > teamA_cat1Count) {
          // Team B has more cat1 players, give better player to Team A
          targetTeamForBetter = teams[0];
          targetTeamForWorse = teams[1];
          console.log(
            `Category ${categoryNum}: Better player (${betterPlayer.name}) → Team A (fewer cat1: ${teamA_cat1Count} vs ${teamB_cat1Count}), Worse player (${worsePlayer.name}) → Team B`,
          );
        } else {
          // Equal cat1 count, use team average as tiebreaker
          const teamA_avg = this.fieldStrength(teams[0]);
          const teamB_avg = this.fieldStrength(teams[1]);

          if (teamA_avg >= teamB_avg) {
            targetTeamForBetter = teams[0];
            targetTeamForWorse = teams[1];
            console.log(
              `Category ${categoryNum}: Equal cat1 count (${teamA_cat1Count}), using avg - Better player (${betterPlayer.name}) → Team A (weaker avg), Worse player (${worsePlayer.name}) → Team B`,
            );
          } else {
            targetTeamForBetter = teams[1];
            targetTeamForWorse = teams[0];
            console.log(
              `Category ${categoryNum}: Equal cat1 count (${teamA_cat1Count}), using avg - Better player (${betterPlayer.name}) → Team B (weaker avg), Worse player (${worsePlayer.name}) → Team A`,
            );
          }
        }
      } else {
        // Categories 2 and 3: Use team average as before
        const teamA_avg = this.fieldStrength(teams[0]);
        const teamB_avg = this.fieldStrength(teams[1]);

        if (teamA_avg >= teamB_avg) {
          targetTeamForBetter = teams[0];
          targetTeamForWorse = teams[1];
          console.log(
            `Category ${categoryNum}: Better player (${betterPlayer.name}) → Team A (weaker), Worse player (${worsePlayer.name}) → Team B`,
          );
        } else {
          targetTeamForBetter = teams[1];
          targetTeamForWorse = teams[0];
          console.log(
            `Category ${categoryNum}: Better player (${betterPlayer.name}) → Team B (weaker), Worse player (${worsePlayer.name}) → Team A`,
          );
        }
      }

      this.addPlayerToTeam(targetTeamForBetter, betterPlayer);
      this.addPlayerToTeam(targetTeamForWorse, worsePlayer);
      this.trace.push({
        kind: "pair",
        role: "field",
        category: categoryNum,
        better: this.tracePlayer(betterPlayer),
        betterTeam: targetTeamForBetter.name,
        worse: this.tracePlayer(worsePlayer),
        worseTeam: targetTeamForWorse.name,
        randomized: player1.multiplier === player2.multiplier,
      });

      // Log balance after each pair
      const teamA_total = teams[0].players.reduce(
        (sum, p) => sum + p.multiplier,
        0,
      );
      const teamB_total = teams[1].players.reduce(
        (sum, p) => sum + p.multiplier,
        0,
      );
      const teamA_count = teams[0].players.length;
      const teamB_count = teams[1].players.length;
      console.log(
        `📊 BALANCE: ${teams[0].name}: ${teamA_count} pelaajaa, kerroin ${teamA_total.toFixed(2)} | ${teams[1].name}: ${teamB_count} pelaajaa, kerroin ${teamB_total.toFixed(2)} | Ero: ${Math.abs(teamA_total - teamB_total).toFixed(2)}`,
      );
    }

    // Handle any remaining single player (shouldn't happen with our logic, but just in case)
    if (playersToProcess.length === 1) {
      const remainingPlayer = playersToProcess[0];

      // For category 1, prioritize balancing count
      if (categoryNum === 1) {
        const teamA_cat1Count = this.countCategory1Players(teams[0]);
        const teamB_cat1Count = this.countCategory1Players(teams[1]);

        const weakerTeam =
          teamA_cat1Count > teamB_cat1Count ? teams[1] : teams[0];
        this.addPlayerToTeam(weakerTeam, remainingPlayer);
        this.trace.push({
          kind: "single",
          role: "field",
          category: categoryNum,
          player: this.tracePlayer(remainingPlayer),
          team: weakerTeam.name,
        });
        console.log(
          `Category ${categoryNum}: Remaining player (${remainingPlayer.name}) → ${weakerTeam.name} (fewer cat1 players)`,
        );
        // Log balance
        const teamA_total = teams[0].players.reduce(
          (sum, p) => sum + p.multiplier,
          0,
        );
        const teamB_total = teams[1].players.reduce(
          (sum, p) => sum + p.multiplier,
          0,
        );
        console.log(
          `📊 BALANCE: ${teams[0].name}: ${teams[0].players.length} pelaajaa, kerroin ${teamA_total.toFixed(2)} | ${teams[1].name}: ${teams[1].players.length} pelaajaa, kerroin ${teamB_total.toFixed(2)} | Ero: ${Math.abs(teamA_total - teamB_total).toFixed(2)}`,
        );
      } else {
        // For other categories, simulate both placements and pick the one
        // that results in the smallest difference between team averages
        const targetTeam = this.pickTeamForOddPlayer(teams, remainingPlayer);
        this.addPlayerToTeam(targetTeam, remainingPlayer);
        this.trace.push({
          kind: "single",
          role: "field",
          category: categoryNum,
          player: this.tracePlayer(remainingPlayer),
          team: targetTeam.name,
        });
        console.log(
          `Category ${categoryNum}: Remaining player (${remainingPlayer.name}) → ${targetTeam.name} (best balance by simulation)`,
        );
        // Log balance
        const teamA_total = teams[0].players.reduce(
          (sum, p) => sum + p.multiplier,
          0,
        );
        const teamB_total = teams[1].players.reduce(
          (sum, p) => sum + p.multiplier,
          0,
        );
        console.log(
          `📊 BALANCE: ${teams[0].name}: ${teams[0].players.length} pelaajaa, kerroin ${teamA_total.toFixed(2)} | ${teams[1].name}: ${teams[1].players.length} pelaajaa, kerroin ${teamB_total.toFixed(2)} | Ero: ${Math.abs(teamA_total - teamB_total).toFixed(2)}`,
        );
      }
    }

    return remainingNextCategory;
  }

  /**
   * Select two random indices from array
   */
  private static selectTwoRandomIndices(arrayLength: number): [number, number] {
    if (arrayLength < 2) throw new Error("Array must have at least 2 elements");

    const first = Math.floor(Math.random() * arrayLength);
    let second = Math.floor(Math.random() * arrayLength);

    // Ensure second index is different from first
    while (second === first) {
      second = Math.floor(Math.random() * arrayLength);
    }

    return [first, second];
  }

  /**
   * Get the best player from a category (lowest multiplier)
   */
  private static getBestPlayerFromCategory(
    players: EnrichedPlayer[],
  ): EnrichedPlayer | null {
    if (players.length === 0) return null;

    // Find minimum multiplier
    const minMultiplier = Math.min(...players.map((p) => p.multiplier));

    // Get all players with minimum multiplier
    const bestPlayers = players.filter((p) => p.multiplier === minMultiplier);

    // If multiple players with same multiplier, pick randomly
    if (bestPlayers.length > 1) {
      const randomIndex = Math.floor(Math.random() * bestPlayers.length);
      return bestPlayers[randomIndex];
    }

    return bestPlayers[0];
  }

  /**
   * For an odd/remaining player, simulate placing them on each team and
   * return the team where the on-ice strengths end up closest.
   */
  private static pickTeamForOddPlayer(
    teams: GeneratedTeamData[],
    player: EnrichedPlayer,
  ): GeneratedTeamData {
    const diffIfA = Math.abs(
      this.fieldStrength(teams[0], player) - this.fieldStrength(teams[1]),
    );
    const diffIfB = Math.abs(
      this.fieldStrength(teams[0]) - this.fieldStrength(teams[1], player),
    );

    console.log(
      `🎯 Odd player (${player.name}, mult=${player.multiplier.toFixed(3)}): diff if→A=${diffIfA.toFixed(4)}, diff if→B=${diffIfB.toFixed(4)} → ${
        diffIfA <= diffIfB ? teams[0].name : teams[1].name
      }`,
    );

    return diffIfA <= diffIfB ? teams[0] : teams[1];
  }

  /**
   * Count category 1 players in a team
   */
  private static countCategory1Players(team: GeneratedTeamData): number {
    // Maalivahdit jaetaan erikseen, joten ne eivät kuulu Cat 1 -tasapainoon
    return team.players.filter((p) => p.category === 1 && p.position !== "MV")
      .length;
  }

  /**
   * Add player to team
   */
  private static addPlayerToTeam(
    team: GeneratedTeamData,
    player: EnrichedPlayer,
  ): void {
    team.players.push(player);
    if (!team.fieldPlayers) team.fieldPlayers = [];
    team.fieldPlayers.push(player);
    // Note: team.members is no longer used - player.teamIds is the source of truth
  }

  /**
   * Distribute goalkeepers so that better goalkeepers go to weaker teams
   * and ensure balanced distribution (one per team when possible)
   */
  private static distributeGoalkeepersByBalance(
    teams: GeneratedTeamData[],
    goalkeepers: EnrichedPlayer[],
    warnings: string[],
  ): void {
    if (goalkeepers.length === 0) return;

    // Sort goalkeepers by multiplier (lower = better)
    const sortedGoalkeepers = [...goalkeepers].sort(
      (a, b) => a.multiplier - b.multiplier,
    );

    console.log(
      `\n🧤 Distributing ${sortedGoalkeepers.length} goalkeepers in pairs:`,
    );

    // Process goalkeepers in pairs
    for (let i = 0; i < sortedGoalkeepers.length; i += 2) {
      const goalkeeper1 = sortedGoalkeepers[i];
      const goalkeeper2 = sortedGoalkeepers[i + 1]; // might be undefined

      // Calculate team averages
      const teamA_avg = this.fieldStrength(teams[0]);
      const teamB_avg = this.fieldStrength(teams[1]);

      // Weaker team gets the better goalkeeper
      const weakerTeam = teamA_avg >= teamB_avg ? teams[0] : teams[1];
      const strongerTeam = teamA_avg >= teamB_avg ? teams[1] : teams[0];

      if (goalkeeper2) {
        // We have a pair - better goalkeeper to weaker team
        // If multipliers are equal, randomly assign to ensure fair distribution
        let betterGk: EnrichedPlayer;
        let worseGk: EnrichedPlayer;

        if (goalkeeper1.multiplier < goalkeeper2.multiplier) {
          betterGk = goalkeeper1;
          worseGk = goalkeeper2;
        } else if (goalkeeper2.multiplier < goalkeeper1.multiplier) {
          betterGk = goalkeeper2;
          worseGk = goalkeeper1;
        } else {
          // Equal multipliers - randomly decide who goes to which team
          if (Math.random() < 0.5) {
            betterGk = goalkeeper1;
            worseGk = goalkeeper2;
            console.log(
              `🎲 Goalkeepers equal multipliers (${goalkeeper1.multiplier.toFixed(3)}): Randomly assigned ${goalkeeper1.name} as "better", ${goalkeeper2.name} as "worse"`,
            );
          } else {
            betterGk = goalkeeper2;
            worseGk = goalkeeper1;
            console.log(
              `🎲 Goalkeepers equal multipliers (${goalkeeper1.multiplier.toFixed(3)}): Randomly assigned ${goalkeeper2.name} as "better", ${goalkeeper1.name} as "worse"`,
            );
          }
        }

        this.addGoalkeeperToTeam(weakerTeam, betterGk);
        this.addGoalkeeperToTeam(strongerTeam, worseGk);
        this.trace.push({
          kind: "pair",
          role: "goalkeeper",
          better: this.tracePlayer(betterGk),
          betterTeam: weakerTeam.name,
          worse: this.tracePlayer(worseGk),
          worseTeam: strongerTeam.name,
          randomized: goalkeeper1.multiplier === goalkeeper2.multiplier,
        });

        console.log(
          `Goalkeeper pair: Better player (${betterGk.name}) → ${weakerTeam.name} (weaker), Worse player (${worseGk.name}) → ${strongerTeam.name}`,
        );
      } else {
        // Pariton maalivahti: joukkueelle, jolla maalivahteja on vähemmän,
        // tasatilanteessa kenttäpelaajiltaan heikommalle. Maalivahteja ei
        // verrata kenttäpelaajien vahvuuteen.
        const gkA = teams[0].goalkeepers?.length || 0;
        const gkB = teams[1].goalkeepers?.length || 0;
        const targetTeam =
          gkA !== gkB ? (gkA < gkB ? teams[0] : teams[1]) : weakerTeam;
        this.addGoalkeeperToTeam(targetTeam, goalkeeper1);
        this.trace.push({
          kind: "single",
          role: "goalkeeper",
          player: this.tracePlayer(goalkeeper1),
          team: targetTeam.name,
        });
        console.log(
          `Goalkeeper single: Remaining player (${goalkeeper1.name}) → ${targetTeam.name} (${gkA !== gkB ? "fewer goalkeepers" : "weaker field players"})`,
        );
      }

      // Log balance after goalkeeper(s)
      const teamA_total = teams[0].players.reduce(
        (sum, p) => sum + p.multiplier,
        0,
      );
      const teamB_total = teams[1].players.reduce(
        (sum, p) => sum + p.multiplier,
        0,
      );
      console.log(
        `📊 BALANCE: ${teams[0].name}: ${teams[0].players.length} pelaajaa, kerroin ${teamA_total.toFixed(2)} | ${teams[1].name}: ${teams[1].players.length} pelaajaa, kerroin ${teamB_total.toFixed(2)} | Ero: ${Math.abs(teamA_total - teamB_total).toFixed(2)}`,
      );
    }

    if (goalkeepers.length > 2) {
      warnings.push(
        `${goalkeepers.length} goalkeepers found, only 2 teams available`,
      );
    }
  }

  /**
   * Helper to add goalkeeper to team
   */
  private static addGoalkeeperToTeam(
    team: GeneratedTeamData,
    goalkeeper: EnrichedPlayer,
  ): void {
    team.players.push(goalkeeper);
    if (!team.goalkeepers) team.goalkeepers = [];
    team.goalkeepers.push(goalkeeper);
  }

  /**
   * Shuffle array in place using Fisher-Yates algorithm
   */
  private static shuffleArray<T>(array: T[]): void {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  /**
   * Tasapainopisteet 0–100 kenttäpelaajien jääaikapainotetun vahvuuden
   * perusteella: 100 = tasan, 1 % ero = 99 pistettä. Maalivahdit eivät ole
   * mukana, koska ne jaetaan omalla säännöllään.
   */
  private static calculateBalanceScore(teams: GeneratedTeamData[]): number {
    if (teams.length < 2) return 100;

    const strengths = teams.map((team) => this.fieldStrength(team));
    const difference = Math.abs(strengths[0] - strengths[1]);
    const mean = (strengths[0] + strengths[1]) / 2;

    if (difference === 0 || mean === 0) return 100;

    const percentageDifference = (difference / mean) * 100;
    console.log(
      `🎯 Balance: on-ice strength ${strengths.map((v) => v.toFixed(3)).join(" vs ")}, difference ${percentageDifference.toFixed(2)}%`,
    );
    return Math.round(Math.max(0, 100 - percentageDifference));
  }

  /**
   * Rebalance category 1 players so that counts differ by at most 1
   * Prefers swapping cat1 ↔ non-cat1 to keep team sizes equal
   */
  private static rebalanceCategory1Players(teams: GeneratedTeamData[]): void {
    if (teams.length !== 2) return;

    let teamA = teams[0];
    let teamB = teams[1];

    // Safety loop to avoid infinite adjustments
    for (let i = 0; i < 10; i++) {
      const cat1A = this.countCategory1Players(teamA);
      const cat1B = this.countCategory1Players(teamB);

      const diff = Math.abs(cat1A - cat1B);
      if (diff <= 1) {
        return;
      }

      // Identify source (has more cat1) and target (has fewer cat1)
      const source = cat1A > cat1B ? teamA : teamB;
      const target = cat1A > cat1B ? teamB : teamA;

      // Maalivahdit jaetaan omalla säännöllään, eivätkä ne ole vaihdossa mukana
      const sourceCat1 = source.players.filter(
        (p) => p.category === 1 && p.position !== "MV",
      );
      const targetNonCat1 = target.players.filter(
        (p) => p.category !== 1 && p.position !== "MV",
      );

      if (sourceCat1.length === 0) {
        return;
      }

      // Vaihto tehdään saman roolin pelaajien kesken (puolustaja ↔
      // puolustaja, hyökkääjä ↔ hyökkääjä). Muuten puolustajamäärät ja
      // huonoimman puolustajan paikka voisivat muuttua jaon jälkeen.
      // Mahdollisista vaihdoista valitaan se, joka jättää joukkueet jäällä
      // tasaisimmiksi.
      const isDefender = (p: EnrichedPlayer) => this.isDefender(p);
      const withSwap = (
        team: GeneratedTeamData,
        out: EnrichedPlayer,
        incoming: EnrichedPlayer,
      ): GeneratedTeamData => ({
        ...team,
        players: [...team.players.filter((p) => p.id !== out.id), incoming],
      });
      let cat1ToMove: EnrichedPlayer | undefined;
      let nonCat1ToMove: EnrichedPlayer | undefined;
      let bestDifference = Infinity;
      for (const candidate of sourceCat1) {
        for (const match of targetNonCat1) {
          if (isDefender(match) !== isDefender(candidate)) continue;
          const difference = Math.abs(
            this.fieldStrength(withSwap(source, candidate, match)) -
              this.fieldStrength(withSwap(target, match, candidate)),
          );
          if (difference < bestDifference) {
            bestDifference = difference;
            cat1ToMove = candidate;
            nonCat1ToMove = match;
          }
        }
      }
      if (!cat1ToMove) {
        if (targetNonCat1.length > 0) {
          // Vain roolin vaihtava vaihto olisi mahdollinen: jätetään tekemättä
          return;
        }
        // Siirto ilman vaihtoa: vain hyökkääjä, ettei puolustajajako muutu
        cat1ToMove = sourceCat1.find((p) => !isDefender(p));
        if (!cat1ToMove) {
          return;
        }
      }

      const removeFromTeam = (team: GeneratedTeamData, playerId: string) => {
        team.players = team.players.filter((p) => p.id !== playerId);
        if (team.fieldPlayers) {
          team.fieldPlayers = team.fieldPlayers.filter(
            (p) => p.id !== playerId,
          );
        }
        if (team.goalkeepers) {
          team.goalkeepers = team.goalkeepers.filter((p) => p.id !== playerId);
        }
      };

      if (nonCat1ToMove) {
        // Swap cat1 ↔ non-cat1
        console.log(
          `♻️ Rebalancing cat1: swapping ${cat1ToMove.name} (cat1) from ${source.name} with ${nonCat1ToMove.name} (non-cat1) from ${target.name}`,
        );

        removeFromTeam(source, cat1ToMove.id);
        removeFromTeam(target, nonCat1ToMove.id);

        this.addPlayerToTeam(source, nonCat1ToMove as EnrichedPlayer);
        this.addPlayerToTeam(target, cat1ToMove as EnrichedPlayer);
        this.trace.push({
          kind: "swap",
          first: this.tracePlayer(cat1ToMove),
          firstTeam: target.name,
          second: this.tracePlayer(nonCat1ToMove),
          secondTeam: source.name,
        });
      } else {
        // Fallback: just move cat1 player to target (sizes may differ by 1)
        console.log(
          `♻️ Rebalancing cat1: moving ${cat1ToMove.name} (cat1) from ${source.name} to ${target.name}`,
        );

        removeFromTeam(source, cat1ToMove.id);
        this.addPlayerToTeam(target, cat1ToMove as EnrichedPlayer);
        this.trace.push({
          kind: "single",
          role: "field",
          category: 1,
          player: this.tracePlayer(cat1ToMove),
          team: target.name,
        });
      }

      // Refresh references in case arrays were reassigned
      teamA = teams[0];
      teamB = teams[1];
    }
  }

  /**
   * Generate balanced teams using POSITION-BASED distribution
   * Prioritizes defensive position balance, then distributes attackers
   */
  private static generateByPosition(
    players: EnrichedPlayer[],
    options: TeamGenerationOptions,
    teamAName: string,
    teamBName: string,
  ): TeamBalanceResult {
    const activePlayers = players;

    if (activePlayers.length === 0) {
      return {
        teams: [],
        balanceScore: 0,
        unusedPlayers: [],
        warnings: ["No active players available"],
      };
    }

    console.log("🎯 Position-based team generation starting");

    // Separate players by position
    const goalkeepers = activePlayers.filter((p) => p.position === "MV");
    const pureDefenders = activePlayers.filter((p) => p.position === "P");
    const hybridPlayers = activePlayers.filter((p) => p.position === "H/P");
    const pureAttackers = activePlayers.filter((p) => p.position === "H");

    console.log("📊 Position distribution:", {
      goalkeepers: goalkeepers.length,
      pureDefenders: pureDefenders.length,
      hybridPlayers: hybridPlayers.length,
      pureAttackers: pureAttackers.length,
    });

    // Create teams
    const teams: GeneratedTeamData[] = [
      {
        id: "team-A",
        name: teamAName,
        adminId: "",
        adminIds: [],
        createdAt: new Date(),
        players: [],
        totalPoints: 0,
        goalkeepers: [],
        fieldPlayers: [],
      },
      {
        id: "team-B",
        name: teamBName,
        adminId: "",
        adminIds: [],
        createdAt: new Date(),
        players: [],
        totalPoints: 0,
        goalkeepers: [],
        fieldPlayers: [],
      },
    ];

    const warnings: string[] = [];

    // Calculate defenders needed based on total field players
    // 20-26 players → 8 defenders, 19 → 7, 14-18 → 6, <14 → 4
    const totalFieldPlayers = activePlayers.length - goalkeepers.length;
    let totalDefendersNeeded: number;

    if (totalFieldPlayers >= 20 && totalFieldPlayers <= 26) {
      totalDefendersNeeded = 8;
    } else if (totalFieldPlayers === 19) {
      totalDefendersNeeded = 7;
    } else if (totalFieldPlayers >= 14 && totalFieldPlayers <= 18) {
      totalDefendersNeeded = 6;
    } else {
      totalDefendersNeeded = 4;
    }

    const defendersPerTeam = Math.ceil(totalDefendersNeeded / 2);

    console.log(
      `🛡️ Defenders calculation: ${totalFieldPlayers} field players → ${totalDefendersNeeded} total defenders → ${defendersPerTeam} per team`,
    );

    // Calculate how many H/P players we need as defenders
    const hybridsNeededAsDefenders = Math.max(
      0,
      totalDefendersNeeded - pureDefenders.length,
    );

    // Count Cat 1 pure defenders
    const cat1PureDefenders = pureDefenders.filter((p) => p.category === 1);
    const cat1PureCount = cat1PureDefenders.length;
    const isCat1PureEven = cat1PureCount % 2 === 0;

    // Get available H/P players by category
    // For Cat 1: shuffle randomly to ensure different H/P players are selected each time
    const cat1Hybrids = hybridPlayers.filter((p) => p.category === 1);
    // Shuffle Cat 1 hybrids randomly (Fisher-Yates)
    for (let i = cat1Hybrids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cat1Hybrids[i], cat1Hybrids[j]] = [cat1Hybrids[j], cat1Hybrids[i]];
    }

    // Cat 2 and 3: sort by skill (best first) for consistent selection
    const cat2Hybrids = hybridPlayers
      .filter((p) => p.category === 2)
      .sort((a, b) => a.multiplier - b.multiplier);
    const cat3Hybrids = hybridPlayers
      .filter((p) => p.category === 3)
      .sort((a, b) => a.multiplier - b.multiplier);

    console.log(
      `🛡️ Cat 1 pure defenders (P): ${cat1PureCount} (${isCat1PureEven ? "even" : "odd"})`,
    );
    console.log(
      `🛡️ H/P players needed as defenders: ${hybridsNeededAsDefenders}`,
    );
    console.log(
      `🛡️ Available H/P: Cat1=${cat1Hybrids.length}, Cat2=${cat2Hybrids.length}, Cat3=${cat3Hybrids.length}`,
    );
    if (cat1Hybrids.length > 0) {
      console.log(
        `🎲 Cat 1 H/P shuffled order: ${cat1Hybrids.map((p) => p.name).join(", ")}`,
      );
    }

    // Select H/P players to become defenders while keeping Cat 1 total even
    const selectedHybridsForDefense: EnrichedPlayer[] = [];
    let cat1HybridsAdded = 0;

    if (hybridsNeededAsDefenders > 0) {
      // Strategy: We need to select hybridsNeededAsDefenders H/P players
      // Goal: Final Cat 1 defender count (P + H/P) must be EVEN for equal team distribution

      // Calculate how many Cat 1 H/P we should add to make Cat 1 total even
      // If Cat 1 P is even: add 0 or 2 Cat 1 H/P
      // If Cat 1 P is odd: add 1 or 3 Cat 1 H/P (prefer 1)

      let cat1HybridsToAdd = 0;

      if (isCat1PureEven) {
        // Cat 1 P is even - add Cat 1 H/P in pairs (0, 2, 4...)
        cat1HybridsToAdd = Math.min(
          Math.floor(hybridsNeededAsDefenders / 2) * 2, // Round down to even
          Math.floor(cat1Hybrids.length / 2) * 2, // Max available even number
        );
        // If we still need more defenders after Cat 1 pairs, we'll use other categories
      } else {
        // Cat 1 P is odd - add odd number of Cat 1 H/P (1, 3, 5...)
        if (cat1Hybrids.length >= 1) {
          // Add at least 1 to make Cat 1 total even
          cat1HybridsToAdd = 1;
          // If we need more and have more Cat 1, add in pairs
          if (hybridsNeededAsDefenders >= 3 && cat1Hybrids.length >= 3) {
            cat1HybridsToAdd = 3;
          }
        }
      }

      console.log(
        `🛡️ Strategy: Adding ${cat1HybridsToAdd} Cat 1 H/P players as defenders`,
      );

      // Add Cat 1 H/P players
      for (let i = 0; i < cat1HybridsToAdd && i < cat1Hybrids.length; i++) {
        const player = cat1Hybrids[i];
        selectedHybridsForDefense.push(player);
        cat1HybridsAdded++;
        console.log(
          `  → Adding H/P ${player.name} (Cat 1, multiplier ${player.multiplier.toFixed(3)}) as defender`,
        );
      }

      // Calculate remaining spots after Cat 1 H/P
      const remainingSpots = hybridsNeededAsDefenders - cat1HybridsAdded;

      if (remainingSpots > 0) {
        // Fill remaining spots with Cat 2, then Cat 3 (in pairs if possible to balance)
        console.log(
          `🛡️ Need ${remainingSpots} more defenders from Cat 2/3 H/P`,
        );

        // Prefer adding in pairs for balance
        let cat2ToAdd = Math.min(remainingSpots, cat2Hybrids.length);
        // If we can make it even, do so
        if (
          cat2ToAdd > 0 &&
          cat2ToAdd % 2 === 1 &&
          cat2Hybrids.length >= cat2ToAdd + 1
        ) {
          // We have one more available, but let's check if adding pairs is better
          // Actually, for Cat 2 we don't need to force pairs, but it's preferable
        }

        for (let i = 0; i < cat2ToAdd; i++) {
          const player = cat2Hybrids[i];
          selectedHybridsForDefense.push(player);
          console.log(
            `  → Adding H/P ${player.name} (Cat 2, multiplier ${player.multiplier.toFixed(3)}) as defender`,
          );
        }

        const stillNeeded = remainingSpots - cat2ToAdd;
        if (stillNeeded > 0) {
          for (let i = 0; i < stillNeeded && i < cat3Hybrids.length; i++) {
            const player = cat3Hybrids[i];
            selectedHybridsForDefense.push(player);
            console.log(
              `  → Adding H/P ${player.name} (Cat 3, multiplier ${player.multiplier.toFixed(3)}) as defender`,
            );
          }
        }
      }

      // Remove selected hybrids from hybridPlayers and add to pureDefenders
      for (const player of selectedHybridsForDefense) {
        const hybridIndex = hybridPlayers.findIndex((p) => p.id === player.id);
        if (hybridIndex !== -1) {
          hybridPlayers.splice(hybridIndex, 1);
        }
        pureDefenders.push(player);
      }

      // Log final Cat 1 defender count
      const finalCat1Count = cat1PureCount + cat1HybridsAdded;
      console.log(
        `🛡️ Final Cat 1 defender count: ${finalCat1Count} (${finalCat1Count % 2 === 0 ? "even ✓" : "odd ⚠️"})`,
      );
    }

    // Step 1: Distribute pure defenders (P) with controlled randomness
    const usedHybrids = this.distributeDefendersWithBalance(
      teams,
      pureDefenders,
      hybridPlayers,
      totalDefendersNeeded,
      warnings,
    );

    // Step 2: Distribute remaining field players (H and remaining H/P)
    const remainingHybrids = hybridPlayers.filter(
      (p) => !usedHybrids.has(p.id),
    );

    // Mark remaining H/P players as attackers
    remainingHybrids.forEach((player) => {
      (player as any).assignedRole = "attacker";
    });

    const remainingFieldPlayers = [...pureAttackers, ...remainingHybrids];

    console.log(
      `⚽ Distributing ${remainingFieldPlayers.length} attackers and remaining hybrids (${remainingHybrids.length} H/P as attackers)`,
    );

    this.distributePlayersByCategory(teams, remainingFieldPlayers, warnings);

    // Step 3: Distribute goalkeepers
    this.distributeGoalkeepersByBalance(teams, goalkeepers, warnings);

    // Ensure final category 1 counts are within 1 between teams
    this.rebalanceCategory1Players(teams);

    // Calculate final team stats
    teams.forEach((team) => {
      team.totalPoints = team.players.reduce(
        (sum, player) => sum + (player.points || 0),
        0,
      );
    });

    const balanceScore = this.calculateBalanceScore(teams);

    const usedPlayerIds = new Set(
      teams.flatMap((team) => team.players.map((p) => p.id)),
    );
    const unusedPlayers = activePlayers.filter((p) => !usedPlayerIds.has(p.id));

    console.log("✅ Position-based generation complete");

    return {
      teams,
      balanceScore,
      unusedPlayers,
      warnings,
    };
  }

  /**
   * Distribute defenders with controlled randomness
   * Uses tier-based shuffling to maintain balance while adding variation
   */
  private static distributeDefendersWithBalance(
    teams: GeneratedTeamData[],
    pureDefenders: EnrichedPlayer[],
    hybridPlayers: EnrichedPlayer[],
    defendersNeeded: number,
    warnings: string[],
  ): Set<string> {
    const usedHybrids = new Set<string>();

    // Sort defenders from WORST to BEST (highest multiplier first)
    const sortedDefenders = [...pureDefenders].sort(
      (a, b) => b.multiplier - a.multiplier,
    );

    // Total defenders needed across both teams (use the passed defendersNeeded directly)
    const totalDefendersNeeded = defendersNeeded;

    console.log(
      `🛡️ Distributing ${sortedDefenders.length} pure defenders (need ${totalDefendersNeeded} total)`,
    );

    // Calculate total defenders we can use (pure + hybrids if needed)
    const totalDefendersAvailable =
      sortedDefenders.length + hybridPlayers.length;

    let defendersToDistribute = [...sortedDefenders];

    // If not enough pure defenders, add hybrids to reach the needed count
    if (sortedDefenders.length < totalDefendersNeeded) {
      const hybridDefendersNeeded = Math.min(
        totalDefendersNeeded - sortedDefenders.length,
        hybridPlayers.length,
      );

      console.log(
        `⚠️ Not enough pure defenders (${sortedDefenders.length}/${totalDefendersNeeded}), adding ${hybridDefendersNeeded} H/P players as defenders`,
      );

      // Sort hybrids by multiplier (worst first, like defenders)
      const sortedHybrids = [...hybridPlayers].sort(
        (a, b) => b.multiplier - a.multiplier,
      );
      const selectedHybrids = sortedHybrids.slice(0, hybridDefendersNeeded);

      // Log which hybrids are being used
      console.log("🔄 H/P players selected as defenders:");
      selectedHybrids.forEach((h, i) => {
        console.log(`  ${i + 1}. ${h.name} (H/P) - ${h.multiplier.toFixed(2)}`);
      });

      selectedHybrids.forEach((p) => usedHybrids.add(p.id));
      defendersToDistribute = [...sortedDefenders, ...selectedHybrids];

      // Re-sort all defenders together (P + H/P) to ensure proper skill distribution
      defendersToDistribute.sort((a, b) => b.multiplier - a.multiplier);

      warnings.push(
        `Using ${hybridDefendersNeeded} H/P players as defenders (total ${defendersToDistribute.length} defenders)`,
      );
    }

    // Parittomalla määrällä toinen joukkue saa yhden puolustajan enemmän.
    // Vajaalla puolella puolustajat ovat jäällä useammin (kolme pelaajaa
    // kahdella paikalla ≈ 2/3 vuoroista, täydellä puolella 1/2), joten
    // huonoin puolustaja ei saa jäädä sinne. Hänet jätetään pareista pois ja
    // sijoitetaan lopuksi ylimääräiseksi: hänen joukkueensa on aina se,
    // jossa puolustajia on enemmän.
    let extraDefender: EnrichedPlayer | null = null;
    if (defendersToDistribute.length % 2 === 1) {
      extraDefender = defendersToDistribute[0];
      defendersToDistribute = defendersToDistribute.slice(1);
      console.log(
        `🛡️ Odd defender count: worst defender ${extraDefender.name} (${extraDefender.multiplier.toFixed(2)}) goes to the side with more defenders`,
      );
    }

    console.log("🛡️ Defender order (worst to best):");
    defendersToDistribute.forEach((d, i) => {
      console.log(
        `  ${i + 1}. ${d.name} (${d.position}) - ${d.multiplier.toFixed(2)}`,
      );
    });

    // Strategy:
    // 1. First pair: two worst defenders (highest multiplier)
    // 2. Remaining pairs: start from best, work towards worst
    // 3. If odd number, the remaining single player will be from the "middle" (worst of remaining)
    console.log("\n🛡️ Distributing defenders in pairs:");

    // Separate first pair (worst two) from the rest
    const worstTwo = defendersToDistribute.slice(0, 2);
    const remainingDefenders = defendersToDistribute.slice(2);

    // Reverse remaining defenders so best come first
    const remainingReversed = [...remainingDefenders].reverse();

    // Combine: worst two first, then best-to-worst for the rest
    let distributionOrder = [...worstTwo, ...remainingReversed];

    // For Cat 1 defenders with even count (4, 6, etc.), randomize WHO is paired with WHOM
    const cat1Defenders = distributionOrder.filter((d) => d.category === 1);
    const nonCat1Defenders = distributionOrder.filter((d) => d.category !== 1);

    if (cat1Defenders.length >= 4 && cat1Defenders.length % 2 === 0) {
      // Shuffle Cat 1 defenders randomly (Fisher-Yates shuffle)
      // This randomizes who gets paired with whom
      const shuffledCat1 = [...cat1Defenders];
      for (let i = shuffledCat1.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledCat1[i], shuffledCat1[j]] = [shuffledCat1[j], shuffledCat1[i]];
      }

      console.log(
        `🎲 Cat 1 defenders (${cat1Defenders.length}): Randomized pairings`,
      );
      console.log(
        "   Original order:",
        cat1Defenders.map((d) => d.name).join(", "),
      );
      console.log(
        "   Shuffled order:",
        shuffledCat1.map((d) => d.name).join(", "),
      );

      // Rebuild distribution order: non-Cat1 first (worst pair), then shuffled Cat1
      const worstTwoAreNonCat1 = worstTwo.every((d) => d.category !== 1);

      if (worstTwoAreNonCat1) {
        // Worst two are Cat 2/3, keep them first, then shuffled Cat1, then rest of non-Cat1
        const restNonCat1 = nonCat1Defenders.filter(
          (d) => !worstTwo.includes(d),
        );
        distributionOrder = [...worstTwo, ...shuffledCat1, ...restNonCat1];
      } else {
        // Worst two include Cat1, just shuffle all Cat1 and put non-Cat1 at the end
        distributionOrder = [...shuffledCat1, ...nonCat1Defenders];
      }
    }

    console.log(
      "🛡️ Distribution order (worst pair first, then best to worst):",
    );
    distributionOrder.forEach((d, i) => {
      console.log(
        `  ${i + 1}. ${d.name} (${d.position}) - ${d.multiplier.toFixed(2)} [Cat ${d.category}]`,
      );
    });

    // Process ALL defenders in pairs
    for (let i = 0; i < distributionOrder.length; i += 2) {
      const defender1 = distributionOrder[i];
      const defender2 = distributionOrder[i + 1]; // might be undefined if odd number

      // Mark H/P players as defenders
      if (defender1.position === "H/P") {
        (defender1 as any).assignedRole = "defender";
      }
      if (defender2 && defender2.position === "H/P") {
        (defender2 as any).assignedRole = "defender";
      }

      // Calculate which team is weaker
      const team0Strength = this.fieldStrength(teams[0]);
      const team1Strength = this.fieldStrength(teams[1]);
      const weakerTeam = team0Strength > team1Strength ? teams[0] : teams[1];
      const strongerTeam = team0Strength > team1Strength ? teams[1] : teams[0];

      if (defender2) {
        // We have a pair - better player (lower multiplier) to weaker team
        // If multipliers are equal, randomly assign who is "better" to ensure fair distribution
        let betterDefender: EnrichedPlayer;
        let worseDefender: EnrichedPlayer;

        if (defender1.multiplier < defender2.multiplier) {
          betterDefender = defender1;
          worseDefender = defender2;
        } else if (defender2.multiplier < defender1.multiplier) {
          betterDefender = defender2;
          worseDefender = defender1;
        } else {
          // Equal multipliers - randomly decide who goes to which team
          if (Math.random() < 0.5) {
            betterDefender = defender1;
            worseDefender = defender2;
            console.log(
              `🎲 Defenders equal multipliers (${defender1.multiplier.toFixed(3)}): Randomly assigned ${defender1.name} as "better", ${defender2.name} as "worse"`,
            );
          } else {
            betterDefender = defender2;
            worseDefender = defender1;
            console.log(
              `🎲 Defenders equal multipliers (${defender1.multiplier.toFixed(3)}): Randomly assigned ${defender2.name} as "better", ${defender1.name} as "worse"`,
            );
          }
        }

        this.addPlayerToTeam(weakerTeam, betterDefender);
        this.addPlayerToTeam(strongerTeam, worseDefender);
        this.trace.push({
          kind: "pair",
          role: "defender",
          better: this.tracePlayer(betterDefender),
          betterTeam: weakerTeam.name,
          worse: this.tracePlayer(worseDefender),
          worseTeam: strongerTeam.name,
          randomized: defender1.multiplier === defender2.multiplier,
        });

        // Get position info for logging (mark H/P as hybrid)
        const betterPos = betterDefender.position === "H/P" ? "H/P" : "P";
        const worsePos = worseDefender.position === "H/P" ? "H/P" : "P";

        console.log(
          `Defender pair ${Math.floor(i / 2) + 1}: Better player (${betterDefender.name}${betterPos === "H/P" ? " [H/P]" : ""}) → ${weakerTeam.name} (weaker), Worse player (${worseDefender.name}${worsePos === "H/P" ? " [H/P]" : ""}) → ${strongerTeam.name}`,
        );
      } else {
        // Odd number - simulate both placements and pick best balance
        const targetTeam = this.pickTeamForOddPlayer(teams, defender1);
        const defPos = defender1.position === "H/P" ? "H/P" : "P";
        console.log(
          `Defender single: Remaining player (${defender1.name}${defPos === "H/P" ? " [H/P]" : ""}) → ${targetTeam.name} (best balance by simulation)`,
        );
        this.addPlayerToTeam(targetTeam, defender1);
        this.trace.push({
          kind: "single",
          role: "defender",
          player: this.tracePlayer(defender1),
          team: targetTeam.name,
        });
      }

      // Log balance after each pair/single
      const team0Total = teams[0].players.reduce(
        (sum, p) => sum + p.multiplier,
        0,
      );
      const team1Total = teams[1].players.reduce(
        (sum, p) => sum + p.multiplier,
        0,
      );
      const team0Avg =
        teams[0].players.length > 0 ? team0Total / teams[0].players.length : 0;
      const team1Avg =
        teams[1].players.length > 0 ? team1Total / teams[1].players.length : 0;
      console.log(
        `📊 BALANCE: ${teams[0].name}: ${team0Avg.toFixed(2)} avg (${teams[0].players.length} pelaajaa) | ${teams[1].name}: ${team1Avg.toFixed(2)} avg (${teams[1].players.length} pelaajaa)`,
      );
    }

    if (extraDefender) {
      if (extraDefender.position === "H/P") {
        (extraDefender as any).assignedRole = "defender";
      }
      const targetTeam = this.pickTeamForOddPlayer(teams, extraDefender);
      // Sama muoto kuin muilla yksittäisillä puolustajilla: webin
      // TeamBalancer-testisivu kokoaa arvontataulukon näistä riveistä
      console.log(
        `Defender single: Remaining player (${extraDefender.name}${extraDefender.position === "H/P" ? " [H/P]" : ""}) → ${targetTeam.name} (weakest defender to the side with more defenders)`,
      );
      this.addPlayerToTeam(targetTeam, extraDefender);
      this.trace.push({
        kind: "single",
        role: "defender",
        player: this.tracePlayer(extraDefender),
        team: targetTeam.name,
      });
    }

    return usedHybrids;
  }

  /**
   * Suggest team improvements
   */
  static suggestTeamImprovements(teams: GeneratedTeamData[]): string[] {
    const suggestions: string[] = [];

    if (teams.length === 0) return suggestions;

    const teamPoints = teams.map((team) => team.totalPoints);
    const averagePoints =
      teamPoints.reduce((sum, points) => sum + points, 0) / teams.length;
    const maxDifference = Math.max(...teamPoints) - Math.min(...teamPoints);

    if (maxDifference > averagePoints * 0.2) {
      suggestions.push(
        "Consider swapping players between teams to reduce skill gap",
      );
    }

    // Check goalkeeper distribution
    const goalkeeperCounts = teams.map((team) => team.goalkeepers?.length || 0);
    const minGoalkeepers = Math.min(...goalkeeperCounts);
    const maxGoalkeepers = Math.max(...goalkeeperCounts);

    if (maxGoalkeepers - minGoalkeepers > 1) {
      suggestions.push("Goalkeeper distribution is uneven across teams");
    }

    return suggestions;
  }
}
