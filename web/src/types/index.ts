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
  // Team-specific skills
  teamSkills?: {
    [teamId: string]: {
      field: {
        category: number;
        multiplier: number;
      };
      goalkeeper: {
        category: number;
        multiplier: number;
      };
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
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
}

// Event types
export interface Event {
  id: string;
  title: string;
  date: string;
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
