// App configuration constants
export const APP_CONFIG = {
  name: "FairDealPro",
  version: "1.0.0",
  description: "Team management and balancing for sports events",
};

// Colors
export const COLORS = {
  primary: "#1976d2",
  secondary: "#388e3c",
  accent: "#ff9800",
  error: "#f44336",
  warning: "#ff9800",
  success: "#4caf50",
  background: "#f5f5f5",
  surface: "#ffffff",
  text: "#333333",
  textSecondary: "#666666",
  border: "#e0e0e0",
};

// Spacing
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

// Font sizes
export const FONT_SIZES = {
  small: 12,
  medium: 16,
  large: 20,
  xlarge: 24,
  xxlarge: 32,
};

// Team balancing defaults
export const TEAM_DEFAULTS = {
  maxPlayersPerTeam: 11,
  maxGoalkeepersPerTeam: 1,
  minSkillLevel: 1,
  maxSkillLevel: 10,
  defaultSkillLevel: 5,
};

// Player positions
export const POSITIONS = {
  GOALKEEPER: "goalkeeper",
  FIELD: "field",
  BOTH: "both",
} as const;

// User roles
export const USER_ROLES = {
  ADMIN: "admin",
  USER: "user",
} as const;
