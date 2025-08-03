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
   * Distribute field players by category using random balanced approach
   */
  private static distributePlayersByCategory(
    teams: Team[],
    fieldPlayers: Player[],
    warnings: string[]
  ): void {
    // Separate players by category (1-3)
    const category1 = fieldPlayers.filter((p) => p.category === 1);
    const category2 = fieldPlayers.filter((p) => p.category === 2);
    const category3 = fieldPlayers.filter((p) => p.category === 3);

    console.log("Category distribution:", {
      cat1: category1.length,
      cat2: category2.length,
      cat3: category3.length,
    });

    // Process Category 1 players
    this.distributeCategoryPlayers(teams, category1, category2, 1, warnings);

    // Process Category 2 players
    this.distributeCategoryPlayers(teams, category2, category3, 2, warnings);

    // Process remaining Category 3 players
    this.distributeCategoryPlayers(teams, category3, [], 3, warnings);
  }

  /**
   * Distribute players from a specific category with balance logic
   */
  private static distributeCategoryPlayers(
    teams: Team[],
    currentCategoryPlayers: Player[],
    nextCategoryPlayers: Player[],
    categoryNum: number,
    warnings: string[]
  ): void {
    if (currentCategoryPlayers.length === 0) return;

    // Shuffle current category players
    const shuffledPlayers = [...currentCategoryPlayers];
    this.shuffleArray(shuffledPlayers);

    let playerIndex = 0;

    while (playerIndex < shuffledPlayers.length) {
      if (playerIndex === shuffledPlayers.length - 1) {
        // Odd number of players - need to pair with next category
        const remainingPlayer = shuffledPlayers[playerIndex];
        const bestNextPlayer =
          this.getBestPlayerFromCategory(nextCategoryPlayers);

        if (bestNextPlayer) {
          // Get team averages to decide placement
          const teamA_avg = this.getTeamAverage(teams[0]);
          const teamB_avg = this.getTeamAverage(teams[1]);

          // Place both players to balance teams
          if (teamA_avg <= teamB_avg) {
            // Team A is better (lower average), give them the worse player
            this.addPlayerToTeam(teams[0], remainingPlayer);
            this.addPlayerToTeam(teams[1], bestNextPlayer);
          } else {
            // Team B is better, give them the worse player
            this.addPlayerToTeam(teams[1], remainingPlayer);
            this.addPlayerToTeam(teams[0], bestNextPlayer);
          }

          // Remove the used next category player
          const nextIndex = nextCategoryPlayers.indexOf(bestNextPlayer);
          if (nextIndex > -1) {
            nextCategoryPlayers.splice(nextIndex, 1);
          }
        } else {
          // No next category player available, place randomly
          const randomTeam = Math.random() < 0.5 ? teams[0] : teams[1];
          this.addPlayerToTeam(randomTeam, remainingPlayer);
        }

        playerIndex++;
      } else {
        // Pair of players - distribute based on balance
        const player1 = shuffledPlayers[playerIndex];
        const player2 = shuffledPlayers[playerIndex + 1];

        // Get team averages
        const teamA_avg = this.getTeamAverage(teams[0]);
        const teamB_avg = this.getTeamAverage(teams[1]);

        // Determine which player is better (lower multiplier = better)
        const player1Better = player1.multiplier < player2.multiplier;
        const betterPlayer = player1Better ? player1 : player2;
        const worsePlayer = player1Better ? player2 : player1;

        if (teamA_avg <= teamB_avg) {
          // Team A is better, give them worse player, Team B gets better player
          this.addPlayerToTeam(teams[0], worsePlayer);
          this.addPlayerToTeam(teams[1], betterPlayer);
        } else {
          // Team B is better, give them worse player, Team A gets better player
          this.addPlayerToTeam(teams[1], worsePlayer);
          this.addPlayerToTeam(teams[0], betterPlayer);
        }

        playerIndex += 2;
      }
    }
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
   * Distribute goalkeepers to the weaker team (higher average)
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

    for (const goalkeeper of sortedGoalkeepers) {
      // Calculate team averages
      const teamA_avg = this.getTeamAverage(teams[0]);
      const teamB_avg = this.getTeamAverage(teams[1]);

      // Place goalkeeper on weaker team (higher average)
      const weakerTeam = teamA_avg >= teamB_avg ? teams[0] : teams[1];

      weakerTeam.players.push(goalkeeper);
      weakerTeam.goalkeepers.push(goalkeeper);
      weakerTeam.members.push(goalkeeper.id);
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
    if (teams.length === 0) return 0;

    const teamPoints = teams.map((team) => team.totalPoints);
    const averagePoints =
      teamPoints.reduce((sum, points) => sum + points, 0) / teams.length;

    // Calculate variance
    const variance =
      teamPoints.reduce((sum, points) => {
        return sum + Math.pow(points - averagePoints, 2);
      }, 0) / teams.length;

    // Convert variance to balance score (lower variance = higher score)
    const maxVariance = Math.pow(averagePoints, 2); // Theoretical maximum variance
    const balanceScore = Math.max(0, 100 - (variance / maxVariance) * 100);

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
