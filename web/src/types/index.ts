// User types (from users collection - Player)
export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  positions: string[]; // Player positions array: ["H", "P", "MV"]
  image?: string;
  isAdmin: boolean;
  isMasterAdmin?: boolean;
  role?: "member" | "admin" | "eventManager";
  teamRoles?: {
    [teamId: string]: "member" | "admin" | "eventManager";
  };
  teamIds: string[];
  teams: string[];
  createdAt?: string;
  // Team-specific skills - only stores relevant position data
  teamSkills?: {
    [teamId: string]: {
      field?: {
        // Field player skills (H or P) - only present if player has H or P position
        category: number;
        multiplier: number;
      };
      goalkeeper?: {
        // Goalkeeper skills (MV) - only present if player has MV position
        category: number;
        multiplier: number;
      };
      // Legacy fields for backwards compatibility
      category?: number;
      multiplier?: number;
      position?: string;
      updatedAt?: string;
    };
  };
  teamMember?: {
    [teamId: string]: boolean;
  };
}

// Team types
export interface Team {
  id: string;
  name: string;
  code: string;
  color?: string; // Hex color code
  description?: string;
  adminId?: string; // Legacy field
  adminIds: string[];
  memberIds?: string[]; // May not exist, calculate from users
  licenseType?: "monthly" | "yearly";
  licenseStatus?: "active" | "expired" | "inactive";
  licenceCode?: string;
  licenseId?: string;
  licenseDuration?: number;
  licenseActivatedAt?: string;
  licenseExpiresAt?: string;
  guestRegistrationHours?: number;
  notificationEnabled?: boolean;
  whatsappGroupName?: string;
  whatsappGroupInviteLink?: string;
  // Team generation names
  teamAName?: string; // Custom name for Team A in random team generation
  teamBName?: string; // Custom name for Team B in random team generation
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
}

// Event types
export interface Event {
  id: string;
  title: string;
  date: string; // ISO date string
  location: string;
  duration: number;
  description?: string;
  teamId: string;
  createdBy: string;
  createdAt: string;
  registeredPlayers: string[];
  reservePlayers?: string[];
  playerRoles?: {
    [playerId: string]: string;
  };
  maxPlayers: number;
  maxGoalkeepers: number;
  generatedTeams?: GeneratedTeamsData;
  lastTeamGeneration?: string;
}

// Generated teams data structure
export interface GeneratedTeamsData {
  balanceScore: number;
  distributionMethod: string;
  eventId: string;
  generatedAt: string;
  generatedBy: string;
  teams: GeneratedTeam[];
}

// Generated team type
export interface GeneratedTeam {
  name: string;
  color: string;
  playerIds: string[];
  players: Array<{
    id: string;
    assignedRole?: "H" | "P" | "MV";
  }>;
  shuffledPlayerIds?: string[];
  totalPoints: number;
}

// License types
export interface License {
  id: string;
  code: string;
  type: "monthly" | "yearly";
  duration: number; // Duration in days
  isUsed: boolean;
  usedByTeamId?: string;
  teamName?: string;
  createdAt?: string;
  updatedAt?: string;
  usedAt?: string;
  licenseExpiresAt?: string;
}

// EnrichedPlayer with computed fields for team generation (web-specific)
export interface EnrichedPlayer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  positions: string[];
  image?: string;
  isAdmin: boolean;
  isMasterAdmin?: boolean;
  teamIds: string[];
  teams: string[];
  teamSkills?: User["teamSkills"];
  teamMember?: User["teamMember"];
  // Computed fields for team generation
  category: number;
  multiplier: number;
  position: string; // Primary position for this event (H/P/MV)
  points: number; // Computed: multiplier * 100
  assignedRole?: "defender" | "attacker";
  playerId: string; // Required for SharedEnrichedPlayer compatibility
  createdAt: Date;
}

// Player type (standalone, not extending User to avoid createdAt conflict)
export interface Player {
  id: string;
  name: string;
  email: string;
  positions: string[];
  teamIds: string[];
  teams: string[];
  isAdmin: boolean;
  createdAt: Date;
}

// Team generation options
export interface TeamGenerationOptions {
  distributionMethod?: "skill-based" | "position-based";
  maxPlayersPerTeam?: number;
  balanceGoalkeepers?: boolean;
}

// Generated team data from TeamBalancer
export interface GeneratedTeamData {
  id: string;
  name: string;
  adminId: string;
  adminIds: string[];
  createdAt: Date;
  players: EnrichedPlayer[];
  totalPoints: number;
  goalkeepers: EnrichedPlayer[];
  fieldPlayers: EnrichedPlayer[];
}

// Team balance result
export interface TeamBalanceResult {
  teams: GeneratedTeamData[];
  balanceScore: number;
  unusedPlayers: EnrichedPlayer[];
  warnings: string[];
}
