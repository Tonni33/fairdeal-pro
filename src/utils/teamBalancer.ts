import {
  Player,
  EnrichedPlayer,
  Team,
  GeneratedTeamData,
  TeamGenerationOptions,
  TeamBalanceResult,
} from "../types";

/**
 * Team balancing algorithm that creates balanced teams based on player skills
 */
export class TeamBalancer {
  /**
   * Generate balanced teams from a list of players using random category-based distribution
   */
  static generateBalancedTeams(
    players: EnrichedPlayer[], // Use EnrichedPlayer with computed fields
    options: TeamGenerationOptions,
    teamAName: string = "Joukkue A",
    teamBName: string = "Joukkue B"
  ): TeamBalanceResult {
    console.log(
      "🎲 TEAMBALANCER: Starting team generation with method:",
      options.distributionMethod || "skill-based (default)"
    );

    // Check distribution method
    if (options.distributionMethod === "position-based") {
      console.log("✅ Using POSITION-BASED distribution");
      return this.generateByPosition(players, options, teamAName, teamBName);
    }

    // Default: skill-based distribution
    console.log("✅ Using SKILL-BASED distribution");
    return this.generateBySkill(players, options, teamAName, teamBName);
  }

  /**
   * Generate balanced teams using SKILL-BASED distribution (original method)
   */
  private static generateBySkill(
    players: EnrichedPlayer[],
    options: TeamGenerationOptions,
    teamAName: string,
    teamBName: string
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
      ["H", "P", "H/P"].includes(p.position)
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

    // Calculate final team stats
    teams.forEach((team) => {
      team.totalPoints = team.players.reduce(
        (sum, player) => sum + (player.points || 0),
        0
      );
    });

    // Calculate balance score
    const balanceScore = this.calculateBalanceScore(teams);

    // Find unused players
    const usedPlayerIds = new Set(
      teams.flatMap((team) => team.players.map((p) => p.id))
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
    warnings: string[]
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
      warnings
    );

    // Process Category 2 players (with remaining players)
    category3 = this.processCategoryWithPairing(
      teams,
      category2,
      category3,
      2,
      warnings
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
    warnings: string[]
  ): EnrichedPlayer[] {
    if (currentCategoryPlayers.length === 0) return nextCategoryPlayers;

    let playersToProcess = [...currentCategoryPlayers];
    let remainingNextCategory = [...nextCategoryPlayers];

    // If odd number of players, pair with best player from next category
    if (playersToProcess.length % 2 === 1 && remainingNextCategory.length > 0) {
      const bestNextPlayer = this.getBestPlayerFromCategory(
        remainingNextCategory
      );
      if (bestNextPlayer) {
        playersToProcess.push(bestNextPlayer);
        // Remove the used player from next category
        remainingNextCategory = remainingNextCategory.filter(
          (p) => p.id !== bestNextPlayer.id
        );
        console.log(
          `Category ${categoryNum}: Added best Category ${
            categoryNum + 1
          } player (${bestNextPlayer.name}) to make even pairs`
        );
      }
    }

    // Process players in pairs
    while (playersToProcess.length >= 2) {
      // Randomly select 2 players from remaining
      const randomIndices = this.selectTwoRandomIndices(
        playersToProcess.length
      );
      const player1 = playersToProcess[randomIndices[0]];
      const player2 = playersToProcess[randomIndices[1]];

      // Remove selected players from array (remove in reverse order to maintain indices)
      playersToProcess.splice(Math.max(randomIndices[0], randomIndices[1]), 1);
      playersToProcess.splice(Math.min(randomIndices[0], randomIndices[1]), 1);

      // Determine which player is better (lower multiplier = better)
      const player1Better = player1.multiplier < player2.multiplier;
      const betterPlayer = player1Better ? player1 : player2;
      const worsePlayer = player1Better ? player2 : player1;

      // For category 1 players, prioritize balancing the COUNT of cat1 players
      // For other categories, use team average
      let targetTeamForBetter: GeneratedTeamData;
      let targetTeamForWorse: GeneratedTeamData;

      if (categoryNum === 1) {
        // Category 1: Balance by COUNT of category 1 players
        const teamA_cat1Count = this.countCategory1Players(teams[0]);
        const teamB_cat1Count = this.countCategory1Players(teams[1]);

        console.log(
          `Category 1 balance check: Team A has ${teamA_cat1Count} cat1, Team B has ${teamB_cat1Count} cat1`
        );

        if (teamA_cat1Count > teamB_cat1Count) {
          // Team A has more cat1 players, give better player to Team B
          targetTeamForBetter = teams[1];
          targetTeamForWorse = teams[0];
          console.log(
            `Category ${categoryNum}: Better player (${betterPlayer.name}) → Team B (fewer cat1: ${teamB_cat1Count} vs ${teamA_cat1Count}), Worse player (${worsePlayer.name}) → Team A`
          );
        } else if (teamB_cat1Count > teamA_cat1Count) {
          // Team B has more cat1 players, give better player to Team A
          targetTeamForBetter = teams[0];
          targetTeamForWorse = teams[1];
          console.log(
            `Category ${categoryNum}: Better player (${betterPlayer.name}) → Team A (fewer cat1: ${teamA_cat1Count} vs ${teamB_cat1Count}), Worse player (${worsePlayer.name}) → Team B`
          );
        } else {
          // Equal cat1 count, use team average as tiebreaker
          const teamA_avg = this.getTeamAverage(teams[0]);
          const teamB_avg = this.getTeamAverage(teams[1]);

          if (teamA_avg >= teamB_avg) {
            targetTeamForBetter = teams[0];
            targetTeamForWorse = teams[1];
            console.log(
              `Category ${categoryNum}: Equal cat1 count (${teamA_cat1Count}), using avg - Better player (${betterPlayer.name}) → Team A (weaker avg), Worse player (${worsePlayer.name}) → Team B`
            );
          } else {
            targetTeamForBetter = teams[1];
            targetTeamForWorse = teams[0];
            console.log(
              `Category ${categoryNum}: Equal cat1 count (${teamA_cat1Count}), using avg - Better player (${betterPlayer.name}) → Team B (weaker avg), Worse player (${worsePlayer.name}) → Team A`
            );
          }
        }
      } else {
        // Categories 2 and 3: Use team average as before
        const teamA_avg = this.getTeamAverage(teams[0]);
        const teamB_avg = this.getTeamAverage(teams[1]);

        if (teamA_avg >= teamB_avg) {
          targetTeamForBetter = teams[0];
          targetTeamForWorse = teams[1];
          console.log(
            `Category ${categoryNum}: Better player (${betterPlayer.name}) → Team A (weaker), Worse player (${worsePlayer.name}) → Team B`
          );
        } else {
          targetTeamForBetter = teams[1];
          targetTeamForWorse = teams[0];
          console.log(
            `Category ${categoryNum}: Better player (${betterPlayer.name}) → Team B (weaker), Worse player (${worsePlayer.name}) → Team A`
          );
        }
      }

      this.addPlayerToTeam(targetTeamForBetter, betterPlayer);
      this.addPlayerToTeam(targetTeamForWorse, worsePlayer);
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
        console.log(
          `Category ${categoryNum}: Remaining player (${remainingPlayer.name}) → ${weakerTeam.name} (fewer cat1 players)`
        );
      } else {
        // For other categories, use team average
        const teamA_avg = this.getTeamAverage(teams[0]);
        const teamB_avg = this.getTeamAverage(teams[1]);

        const weakerTeam = teamA_avg >= teamB_avg ? teams[0] : teams[1];
        this.addPlayerToTeam(weakerTeam, remainingPlayer);
        console.log(
          `Category ${categoryNum}: Remaining player (${remainingPlayer.name}) → ${weakerTeam.name} (weaker team)`
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
    players: EnrichedPlayer[]
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
   * Get team average multiplier (lower = better team)
   */
  private static getTeamAverage(team: GeneratedTeamData): number {
    if (team.players.length === 0) return 0;

    const totalMultiplier = team.players.reduce(
      (sum, player) => sum + player.multiplier,
      0
    );
    return totalMultiplier / team.players.length;
  }

  /**
   * Count category 1 players in a team
   */
  private static countCategory1Players(team: GeneratedTeamData): number {
    return team.players.filter((p) => p.category === 1).length;
  }

  /**
   * Add player to team
   */
  private static addPlayerToTeam(
    team: GeneratedTeamData,
    player: EnrichedPlayer
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
    warnings: string[]
  ): void {
    if (goalkeepers.length === 0) return;

    // Sort goalkeepers by multiplier (lower = better)
    const sortedGoalkeepers = [...goalkeepers].sort(
      (a, b) => a.multiplier - b.multiplier
    );

    for (let i = 0; i < sortedGoalkeepers.length; i++) {
      const goalkeeper = sortedGoalkeepers[i];

      // Calculate team averages
      const teamA_avg = this.getTeamAverage(teams[0]);
      const teamB_avg = this.getTeamAverage(teams[1]);

      // Count current goalkeepers in each team
      if (!teams[0].goalkeepers) teams[0].goalkeepers = [];
      if (!teams[1].goalkeepers) teams[1].goalkeepers = [];
      const teamA_goalkeepers = teams[0].goalkeepers.length;
      const teamB_goalkeepers = teams[1].goalkeepers.length;

      let targetTeam: Team;

      // First, try to balance goalkeeper count (one per team)
      if (teamA_goalkeepers < teamB_goalkeepers) {
        targetTeam = teams[0];
        console.log(
          `Goalkeeper ${goalkeeper.name} → Team A (fewer goalkeepers: ${teamA_goalkeepers} vs ${teamB_goalkeepers})`
        );
      } else if (teamB_goalkeepers < teamA_goalkeepers) {
        targetTeam = teams[1];
        console.log(
          `Goalkeeper ${goalkeeper.name} → Team B (fewer goalkeepers: ${teamB_goalkeepers} vs ${teamA_goalkeepers})`
        );
      } else {
        // Equal goalkeeper count, place on weaker team (higher average = weaker team)
        targetTeam = teamA_avg >= teamB_avg ? teams[0] : teams[1];
        console.log(
          `Goalkeeper ${goalkeeper.name} (multiplier: ${
            goalkeeper.multiplier
          }) → ${targetTeam.name} (weaker team, avg: ${
            teamA_avg >= teamB_avg ? teamA_avg.toFixed(2) : teamB_avg.toFixed(2)
          })`
        );
      }

      targetTeam.players.push(goalkeeper);
      if (!targetTeam.goalkeepers) targetTeam.goalkeepers = [];
      targetTeam.goalkeepers.push(goalkeeper);
      // Note: team.members is no longer used - player.teamIds is the source of truth
    }

    if (goalkeepers.length > 2) {
      warnings.push(
        `${goalkeepers.length} goalkeepers found, only 2 teams available`
      );
    }
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
   * Calculate how balanced the teams are (0-100 score)
   */
  private static calculateBalanceScore(teams: GeneratedTeamData[]): number {
    console.log("🔍 calculateBalanceScore called with teams:", teams.length);

    if (teams.length === 0) {
      console.log("❌ No teams provided");
      return 0;
    }

    const teamPoints = teams.map((team) => {
      const points = team.totalPoints || 0;
      console.log(`Team ${team.name}: ${points} points`);
      return points;
    });

    console.log("📊 All team points:", teamPoints);

    if (teamPoints.length < 2) {
      console.log("⚠️ Less than 2 teams, returning 100");
      return 100;
    }

    // Calculate the difference between highest and lowest scoring teams
    const maxPoints = Math.max(...teamPoints);
    const minPoints = Math.min(...teamPoints);
    const pointDifference = maxPoints - minPoints;
    const averagePoints =
      teamPoints.reduce((sum, points) => sum + points, 0) / teams.length;

    console.log("🎯 Balance Score Calculation:", {
      teamPoints,
      maxPoints,
      minPoints,
      pointDifference,
      averagePoints,
    });

    // If there's no difference, perfect balance
    if (pointDifference === 0) {
      console.log("✅ Perfect balance - no difference");
      return 100;
    }

    // Calculate percentage difference relative to average
    const percentageDifference = (pointDifference / averagePoints) * 100;

    console.log("📊 Percentage difference:", percentageDifference);

    // Balance score: 100 means perfect balance, decreases as difference increases
    // 5% difference = 95 points, 10% difference = 90 points, etc.
    const balanceScore = Math.max(0, 100 - percentageDifference);

    console.log("🎯 Final balance score:", Math.round(balanceScore));

    return Math.round(balanceScore);
  }

  /**
   * Generate balanced teams using POSITION-BASED distribution
   * Prioritizes defensive position balance, then distributes attackers
   */
  private static generateByPosition(
    players: EnrichedPlayer[],
    options: TeamGenerationOptions,
    teamAName: string,
    teamBName: string
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

    // Calculate defenders needed per team (approximately 2/5 or 40% of field players)
    const totalFieldPlayers = activePlayers.length - goalkeepers.length;
    const totalDefendersNeeded = Math.round(totalFieldPlayers * 0.4);
    const defendersPerTeam = Math.ceil(totalDefendersNeeded / 2);

    console.log(
      `🛡️ Defenders calculation: ${totalFieldPlayers} field players * 0.4 = ${totalDefendersNeeded} total defenders → ${defendersPerTeam} per team`
    );

    // Step 1: Distribute pure defenders (P) with controlled randomness
    const usedHybrids = this.distributeDefendersWithBalance(
      teams,
      pureDefenders,
      hybridPlayers,
      defendersPerTeam,
      warnings
    );

    // Step 2: Distribute remaining field players (H and remaining H/P)
    const remainingHybrids = hybridPlayers.filter(
      (p) => !usedHybrids.has(p.id)
    );

    // Mark remaining H/P players as attackers
    remainingHybrids.forEach((player) => {
      (player as any).assignedRole = "attacker";
    });

    const remainingFieldPlayers = [...pureAttackers, ...remainingHybrids];

    console.log(
      `⚽ Distributing ${remainingFieldPlayers.length} attackers and remaining hybrids (${remainingHybrids.length} H/P as attackers)`
    );

    this.distributePlayersByCategory(teams, remainingFieldPlayers, warnings);

    // Step 3: Distribute goalkeepers
    this.distributeGoalkeepersByBalance(teams, goalkeepers, warnings);

    // Calculate final team stats
    teams.forEach((team) => {
      team.totalPoints = team.players.reduce(
        (sum, player) => sum + (player.points || 0),
        0
      );
    });

    const balanceScore = this.calculateBalanceScore(teams);

    const usedPlayerIds = new Set(
      teams.flatMap((team) => team.players.map((p) => p.id))
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
    warnings: string[]
  ): Set<string> {
    const usedHybrids = new Set<string>();

    // Sort defenders from WORST to BEST (highest multiplier first)
    const sortedDefenders = [...pureDefenders].sort(
      (a, b) => b.multiplier - a.multiplier
    );

    console.log(
      `🛡️ Distributing ${sortedDefenders.length} pure defenders (need ${defendersNeeded} per team)`
    );

    // Calculate total defenders we can use (pure + hybrids if needed)
    const totalDefendersAvailable =
      sortedDefenders.length + hybridPlayers.length;
    const totalDefendersNeeded = defendersNeeded * 2;

    let defendersToDistribute = sortedDefenders;

    // If not enough pure defenders, add hybrids
    if (sortedDefenders.length < totalDefendersNeeded) {
      const hybridDefendersNeeded = Math.min(
        totalDefendersNeeded - sortedDefenders.length,
        hybridPlayers.length
      );

      console.log(
        `⚠️ Not enough pure defenders, adding ${hybridDefendersNeeded} H/P players`
      );

      const sortedHybrids = [...hybridPlayers].sort(
        (a, b) => b.multiplier - a.multiplier
      );
      const selectedHybrids = sortedHybrids.slice(0, hybridDefendersNeeded);

      selectedHybrids.forEach((p) => usedHybrids.add(p.id));
      defendersToDistribute = [...sortedDefenders, ...selectedHybrids];

      // Re-sort all defenders together (P + H/P) to ensure proper skill distribution
      defendersToDistribute.sort((a, b) => b.multiplier - a.multiplier);

      warnings.push(
        `Using ${hybridDefendersNeeded} H/P players as defenders (total ${defendersToDistribute.length} defenders)`
      );
    }

    console.log("🛡️ Defender order (worst to best):");
    defendersToDistribute.forEach((d, i) => {
      console.log(
        `  ${i + 1}. ${d.name} (${d.position}) - ${d.multiplier.toFixed(2)}`
      );
    });

    // Strategy: Ensure two weakest defenders go to different teams,
    // then shuffle remaining and distribute in pairs with balancing
    console.log("🎲 Using balanced pair distribution with randomness");

    // Step 1: Assign two weakest defenders to different teams
    const twoWeakest = defendersToDistribute.slice(0, 2);
    const remaining = defendersToDistribute.slice(2);

    if (twoWeakest.length >= 2) {
      console.log(`\n� Distributing 2 weakest defenders to different teams:`);

      // First weakest to team 0
      if (twoWeakest[0].position === "H/P") {
        (twoWeakest[0] as any).assignedRole = "defender";
      }
      this.addPlayerToTeam(teams[0], twoWeakest[0]);
      console.log(
        `  ${twoWeakest[0].name} (${twoWeakest[0].multiplier.toFixed(2)}) → ${
          teams[0].name
        }`
      );

      // Second weakest to team 1
      if (twoWeakest[1].position === "H/P") {
        (twoWeakest[1] as any).assignedRole = "defender";
      }
      this.addPlayerToTeam(teams[1], twoWeakest[1]);
      console.log(
        `  ${twoWeakest[1].name} (${twoWeakest[1].multiplier.toFixed(2)}) → ${
          teams[1].name
        }`
      );
    } else if (twoWeakest.length === 1) {
      // Only one defender total, assign to team 0
      if (twoWeakest[0].position === "H/P") {
        (twoWeakest[0] as any).assignedRole = "defender";
      }
      this.addPlayerToTeam(teams[0], twoWeakest[0]);
      console.log(
        `  ${twoWeakest[0].name} (${twoWeakest[0].multiplier.toFixed(2)}) → ${
          teams[0].name
        }`
      );
    }

    // Step 2: Shuffle remaining defenders for randomness
    console.log(`\n🔀 Shuffling ${remaining.length} remaining defenders...`);
    this.shuffleArray(remaining);

    console.log("Shuffled order:");
    remaining.forEach((d, i) => {
      console.log(`  ${i + 1}. ${d.name} (${d.multiplier.toFixed(2)})`);
    });

    // Step 3: Distribute remaining defenders in PAIRS, balancing as we go
    console.log(`\n⚖️ Distributing in pairs with balance:`);

    // Process defenders in pairs from shuffled list
    for (let i = 0; i < remaining.length; i += 2) {
      const defender1 = remaining[i];
      const defender2 = remaining[i + 1]; // might be undefined if odd number

      // Mark H/P players as defenders
      if (defender1.position === "H/P") {
        (defender1 as any).assignedRole = "defender";
      }
      if (defender2 && defender2.position === "H/P") {
        (defender2 as any).assignedRole = "defender";
      }

      // Calculate current team strengths (total multipliers, higher = weaker)
      const team0Strength = teams[0].players.reduce(
        (sum, p) => sum + p.multiplier,
        0
      );
      const team1Strength = teams[1].players.reduce(
        (sum, p) => sum + p.multiplier,
        0
      );

      // Determine which team is weaker (needs better players)
      const weakerTeam = team0Strength > team1Strength ? teams[0] : teams[1];
      const strongerTeam = team0Strength > team1Strength ? teams[1] : teams[0];

      if (defender2) {
        // We have a pair - assign better player (lower multiplier) to weaker team
        const betterDefender =
          defender1.multiplier < defender2.multiplier ? defender1 : defender2;
        const worseDefender =
          defender1.multiplier < defender2.multiplier ? defender2 : defender1;

        this.addPlayerToTeam(weakerTeam, betterDefender);
        this.addPlayerToTeam(strongerTeam, worseDefender);

        console.log(
          `  Pair ${Math.floor(i / 2) + 1}: ${
            betterDefender.name
          } (${betterDefender.multiplier.toFixed(2)}) → ${
            weakerTeam.name
          } (weaker), ${worseDefender.name} (${worseDefender.multiplier.toFixed(
            2
          )}) → ${
            strongerTeam.name
          } (stronger) [Before: ${team0Strength.toFixed(
            1
          )} vs ${team1Strength.toFixed(1)}]`
        );
      } else {
        // Odd number - assign last defender to weaker team
        this.addPlayerToTeam(weakerTeam, defender1);
        console.log(
          `  Last defender: ${defender1.name} (${defender1.multiplier.toFixed(
            2
          )}) → ${weakerTeam.name} [${team0Strength.toFixed(
            1
          )} vs ${team1Strength.toFixed(1)}]`
        );
      }
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
        "Consider swapping players between teams to reduce skill gap"
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
