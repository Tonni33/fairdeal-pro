import {
  Player,
  Team,
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
    players: Player[],
    options: TeamGenerationOptions,
    teamAName: string = "Joukkue A",
    teamBName: string = "Joukkue B"
  ): TeamBalanceResult {
    const activePlayers = players.filter((p) => p.isActive);

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
    const teams: Team[] = [
      {
        id: "team-A",
        name: teamAName,
        adminId: "",
        members: [],
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
        members: [],
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
    teams: Team[],
    fieldPlayers: Player[],
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
    teams: Team[],
    currentCategoryPlayers: Player[],
    nextCategoryPlayers: Player[],
    categoryNum: number,
    warnings: string[]
  ): Player[] {
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

      // Get team averages to determine which team is weaker
      const teamA_avg = this.getTeamAverage(teams[0]);
      const teamB_avg = this.getTeamAverage(teams[1]);

      if (teamA_avg >= teamB_avg) {
        // Team A is weaker (higher average), give them the better player
        this.addPlayerToTeam(teams[0], betterPlayer);
        this.addPlayerToTeam(teams[1], worsePlayer);
        console.log(
          `Category ${categoryNum}: Better player (${betterPlayer.name}) → Team A (weaker), Worse player (${worsePlayer.name}) → Team B`
        );
      } else {
        // Team B is weaker, give them the better player
        this.addPlayerToTeam(teams[1], betterPlayer);
        this.addPlayerToTeam(teams[0], worsePlayer);
        console.log(
          `Category ${categoryNum}: Better player (${betterPlayer.name}) → Team B (weaker), Worse player (${worsePlayer.name}) → Team A`
        );
      }
    }

    // Handle any remaining single player (shouldn't happen with our logic, but just in case)
    if (playersToProcess.length === 1) {
      const remainingPlayer = playersToProcess[0];
      const teamA_avg = this.getTeamAverage(teams[0]);
      const teamB_avg = this.getTeamAverage(teams[1]);

      // Give remaining player to weaker team
      const weakerTeam = teamA_avg >= teamB_avg ? teams[0] : teams[1];
      this.addPlayerToTeam(weakerTeam, remainingPlayer);
      console.log(
        `Category ${categoryNum}: Remaining player (${remainingPlayer.name}) → ${weakerTeam.name} (weaker team)`
      );
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
  private static getBestPlayerFromCategory(players: Player[]): Player | null {
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
  private static getTeamAverage(team: Team): number {
    if (team.players.length === 0) return 0;

    const totalMultiplier = team.players.reduce(
      (sum, player) => sum + player.multiplier,
      0
    );
    return totalMultiplier / team.players.length;
  }

  /**
   * Add player to team
   */
  private static addPlayerToTeam(team: Team, player: Player): void {
    team.players.push(player);
    team.fieldPlayers.push(player);
    team.members.push(player.id);
  }

  /**
   * Distribute goalkeepers so that better goalkeepers go to weaker teams
   * and ensure balanced distribution (one per team when possible)
   */
  private static distributeGoalkeepersByBalance(
    teams: Team[],
    goalkeepers: Player[],
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
      targetTeam.goalkeepers.push(goalkeeper);
      targetTeam.members.push(goalkeeper.id);
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
  private static calculateBalanceScore(teams: Team[]): number {
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
   * Suggest team improvements
   */
  static suggestTeamImprovements(teams: Team[]): string[] {
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
    const goalkeeperCounts = teams.map((team) => team.goalkeepers.length);
    const minGoalkeepers = Math.min(...goalkeeperCounts);
    const maxGoalkeepers = Math.max(...goalkeeperCounts);

    if (maxGoalkeepers - minGoalkeepers > 1) {
      suggestions.push("Goalkeeper distribution is uneven across teams");
    }

    return suggestions;
  }
}
