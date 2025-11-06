// Team-Player relationship with team-specific skills
export interface TeamPlayer {
  id: string; // Unique document ID
  playerId: string; // Reference to Player document
  teamId: string; // Reference to Team document
  category: number; // Team-specific category (1, 2, 3)
  multiplier: number; // Team-specific skill multiplier
  position: string; // Primary team-specific position (legacy, for backwards compatibility)
  positions?: string[]; // Team-specific positions array: ["H", "P", "MV"]
  isActive: boolean; // Active in this team
  joinedAt: Date; // When player joined this team
  updatedAt?: Date; // When team-specific skills were last updated
  updatedBy?: string; // Who updated the team-specific skills
  notes?: string; // Team-specific notes about the player
}

// Player types (from users collection)
export interface Player {
  id: string;
  name: string;
  email: string;
  phone?: string;
  category: number; // Player category/class (1, 2, 3)
  multiplier: number; // Skill multiplier for balancing
  position: string; // Primary position (legacy, computed from positions array for backwards compatibility)
  positions?: string[]; // Player positions array: ["H", "P", "MV"] - can have multiple roles
  image?: string; // Profile image URL
  isAdmin: boolean; // Legacy admin field for compatibility
  role?: "member" | "admin" | "eventManager"; // Global role (legacy)
  // Team-specific roles - NEW!
  teamRoles?: {
    [teamId: string]: "member" | "admin" | "eventManager";
  };
  licenceCode?: string;
  playerId: string;
  teamIds: string[]; // Array of team IDs this player belongs to
  teams: string[]; // Array of team names
  createdAt: Date;
  // Team-specific skills stored in the user document
  teamSkills?: {
    [teamId: string]: {
      field?: {
        // Kenttäpelaaja (H tai P)
        category: number;
        multiplier: number;
      };
      goalkeeper?: {
        // Maalivahti (MV)
        category: number;
        multiplier: number;
      };
      // Legacy fields for backwards compatibility
      category?: number;
      multiplier?: number;
      position?: string;
      updatedAt?: Date;
    };
  };
  // Team member status - whether player is a regular member (vakiokävijä) in each team
  teamMember?: {
    [teamId: string]: boolean; // true = regular member, false = occasional/guest
  };
  // Legacy fields for compatibility - required to avoid undefined errors
  skillLevel: number; // 1-5 scale (derived from multiplier)
  isActive: boolean;
  isGoalkeeper: boolean; // Derived from position
  points: number; // Skill points for balancing (derived from multiplier)
  notes?: string; // Additional notes about player
  createdBy?: string; // User ID who created the player
  updatedAt?: Date;
}

// Team types (from teams collection)
export interface Team {
  id: string;
  name: string;
  description?: string;
  color?: string;
  code?: string; // Team join code
  adminIds: string[]; // Array of admin user IDs
  // Note: team.members field removed - player.teamIds is now the source of truth for team membership
  // Backward compatibility
  adminId?: string; // Legacy field for compatibility
  // License fields
  licenceCode?: string; // License code for app usage
  licenseStatus?: "active" | "expired" | "inactive"; // Current license status
  licenseExpiresAt?: Date; // When the license expires
  licenseActivatedAt?: Date; // When the license was activated
  licenseDuration?: number; // License duration in days
  licenseId?: string; // Reference to the license document in licenses collection
  licenseType?: "trial" | "half-season" | "season"; // Type of license
  seasonEndDate?: Date; // Season end date for easier tracking
  // Team generation names
  teamAName?: string; // Custom name for Team A in random team generation
  teamBName?: string; // Custom name for Team B in random team generation
  // WhatsApp group information
  whatsappGroupName?: string; // WhatsApp group name
  whatsappGroupInviteLink?: string; // WhatsApp group invite link
  // Guest registration settings
  guestRegistrationHours?: number; // Hours before event when guests (teamMember: false) can register
  createdAt: Date;
  // Legacy fields for compatibility - required to avoid undefined errors
  players: Player[]; // Populated players array (derived from members)
  totalPoints: number;
  goalkeepers?: Player[]; // Optional - only used in team generation
  fieldPlayers?: Player[]; // Optional - only used in team generation
}

// License types
export interface License {
  id: string;
  code: string; // License code (e.g., "FD2024-ABC123")
  type: "trial" | "half-season" | "season"; // License type: trial (60 days), half-season (183 days), season (365 days)
  duration: number; // Duration in days (60, 183, 365)
  price?: number; // Price in euros (0 for trial, 69 for half-season, 99 for season)
  isUsed: boolean; // Whether the license has been used
  usedByTeamId?: string; // Which team used this license
  teamName?: string; // Name of the team that used this license (for easier identification)
  createdAt: Date;
  createdBy?: string; // Who created the license
  usedAt?: Date;
  expiresAt?: Date; // When the license itself expires (for unused licenses)
  updatedAt?: Date;
}

// Team Club/Organization types
export interface TeamClub {
  id: string;
  name: string;
  description?: string;
  logoUrl?: string;
  settings: {
    defaultMaxPlayers: number;
    defaultMaxGoalkeepers: number;
    skillLevels: string[];
    positions: string[];
  };
  admins: string[]; // User IDs
  members: string[]; // User IDs
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// Settings types
export interface AppSettings {
  id: string;
  selectedTeamClub?: string; // Selected team club ID
  theme: "light" | "dark" | "auto";
  notifications: {
    events: boolean;
    teamChanges: boolean;
    newMembers: boolean;
  };
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

// Event types
export interface Event {
  id: string;
  title: string;
  description?: string;
  date: Date;
  location?: string;
  maxPlayers: number;
  maxGoalkeepers?: number; // Maximum number of goalkeepers
  registeredPlayers?: string[]; // User/Player IDs from users collection
  reservePlayers?: string[]; // User/Player IDs in reserve queue
  playerRoles?: Record<string, string>; // Player ID -> selected role for this event (H, P, or MV)
  teams?: Team[];
  teamId?: string; // Associated team ID
  createdBy: string; // User ID
  createdAt: Date;
  generatedTeams?: {
    eventId: string;
    teams: {
      name: string;
      playerIds: string[];
      totalPoints: number;
      color: string;
    }[];
    generatedAt: Date;
    generatedBy: string;
    balanceScore: number;
  };
  lastTeamGeneration?: Date;
}

// Message types
export interface Message {
  id: string;
  eventId: string; // Reference to the event
  message: string; // The message content
  createdAt: Date;
  createdBy: string; // User email or display name
  updatedAt?: Date;
  updatedBy?: string;
  isDeleted?: boolean; // Soft delete flag
}

export interface GameEvent {
  id: string;
  name: string;
  description?: string;
  date: Date;
  time: string;
  location?: string;
  maxPlayers: number;
  maxGoalkeepers: number;
  participants: string[]; // Player IDs
  teams?: Team[];
  isActive: boolean;
  createdBy: string; // User ID
  createdAt: Date;
  updatedAt: Date;
}

// User types
export interface User {
  id: string;
  uid: string; // Firebase auth UID
  email: string;
  name?: string; // User's full name
  displayName?: string;
  phoneNumber?: string; // User's phone number
  role: "admin" | "user";
  isAdmin?: boolean; // Legacy admin field for compatibility
  isMasterAdmin?: boolean; // Master admin field for license management
  playerId?: string; // Reference to Player if user is also a player
  createdAt: Date;
}

// Team balancing types
export interface TeamGenerationOptions {
  playersPerTeam: number;
  goalkeepersPerTeam: number;
  balanceMethod: "skillLevel" | "points" | "hybrid";
  allowPartialTeams: boolean;
}

export interface TeamBalanceResult {
  teams: Team[];
  balanceScore: number; // How balanced the teams are (0-100)
  unusedPlayers: Player[];
  warnings: string[];
}

// Navigation types
export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  Events: undefined;
  EventDetails: { eventId: string };
  Players: undefined;
  PlayerDetails: { playerId: string };
  CreateEvent: undefined;
  CreatePlayer: undefined;
  UserManagement: undefined;
  TeamGeneration: { eventId: string };
  Profile: undefined;
  EventManagementScreen: undefined;
  Settings: undefined;
  Migration: undefined;
  TeamManagement: undefined;
  AdminMenu: undefined;
  MasterAdmin: undefined;
  Ranking: undefined;
};

export type BottomTabParamList = {
  Home: undefined;
  Events: undefined;
  Teams: undefined;
  Players: undefined;
  Profile: undefined;
};

// Form types
export interface CreateEventForm {
  name: string;
  description: string;
  date: Date;
  time: string;
  location: string;
  maxPlayers: number;
  maxGoalkeepers: number;
}

export interface CreatePlayerForm {
  name: string;
  email: string;
  phone: string;
  skillLevel: number;
  position: "goalkeeper" | "field" | "both";
  category: number;
}

// API response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Context types
export interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    displayName?: string
  ) => Promise<void>;
  signOut: () => Promise<void>;
  changePassword: (newPassword: string) => Promise<void>;
  deleteAccount: () => Promise<void>;
}

export interface AppContextType {
  players: Player[];
  events: Event[];
  teams: Team[];
  teamPlayers: TeamPlayer[];
  selectedTeamClub: TeamClub | null;
  setSelectedTeamClub: (teamClub: TeamClub | null) => void;
  selectedTeamId: string | null;
  setSelectedTeamId: (teamId: string | null) => void;
  loading: boolean;
  error: string | null;
  refreshData: () => Promise<void>;
  getUserAdminTeams: (
    user: { uid: string; isMasterAdmin?: boolean } | null | undefined,
    teams: Team[]
  ) => Team[];
  isUserSoleAdminInAnyTeam: (
    user: { uid: string; isMasterAdmin?: boolean } | null | undefined,
    teams: Team[]
  ) => boolean;
}

// Team creation request types
export interface TeamCreationRequest {
  id: string;
  userId: string; // ID of user requesting team creation
  userEmail: string; // Email of user requesting team creation
  userName: string; // Name of user requesting team creation
  teamName: string; // Requested team name
  description?: string; // Optional team description
  estimatedPlayerCount?: number; // Estimated number of players
  contactInfo?: string; // Additional contact information
  businessInfo?: string; // Business/organization information if applicable
  licenseType?: "trial" | "season" | "half-season"; // License type: trial (2 months), season (99€), or half-season (69€)
  status: "pending" | "approved" | "rejected"; // Request status
  createdAt: Date;
  reviewedAt?: Date; // When master admin reviewed the request
  reviewedBy?: string; // Master admin who reviewed
  rejectionReason?: string; // Reason for rejection if applicable
  approvedTeamId?: string; // Team ID if request was approved
}

// License request types
export interface LicenseRequest {
  id: string;
  teamId: string; // ID of team requesting license
  teamName: string; // Name of team requesting license
  requestedBy: string; // User ID who requested the license
  requestType: "new" | "renewal"; // New license or renewal
  requestedAt: Date;
  status: "pending" | "approved" | "rejected"; // Request status
  reviewedAt?: Date; // When master admin reviewed the request
  reviewedBy?: string; // Master admin who reviewed
  rejectionReason?: string; // Reason for rejection if applicable
  approvedLicenseId?: string; // License ID if request was approved
  // Additional team info for new license requests
  teamDescription?: string;
  estimatedPlayerCount?: number;
  adminName?: string;
  adminEmail?: string;
  adminPhone?: string; // Admin phone number
  requestedLicenseType?: "trial" | "half-season" | "season"; // Type of license requested
}
