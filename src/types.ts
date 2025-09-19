// Core type definitions for Discord MC Bot

// Player and activity event types
export interface Player {
  username: string;
  totalDeaths: number;
  lastJoin: Date | null;
  lastLeave: Date | null;
  createdAt: Date;
}

// Activity log events
export type ActivityEventType = "JOIN" | "LEAVE" | "DEATH" | "ACHIEVEMENT";

export interface ActivityEvent {
  id?: number;
  username: string;
  eventType: ActivityEventType;
  timestamp: Date;
  details?: string; // Death cause or achievement name
  createdAt?: Date;
}

// Death event for announcements
export interface DeathEvent {
  username: string;
  timestamp: Date;
  cause: string;
}

// Daily leaderboard data structures
export interface DailyLeaderboard {
  generatedAt: Date;
  totalPlayers: number;
  leaderboard: LeaderboardEntry[];
  survivalChampion: SurvivalChampion | null;
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  totalDeaths: number;
  isActive: boolean; // Within 7-day activity window
}

export interface SurvivalChampion {
  username: string;
  timeAliveMs: number;
  lastDeathTimestamp: string | null;
  formattedTimeAlive: string; // Human-readable format
}

// Discord configuration
export interface DiscordChannelConfig {
  channelId: string;
  guildId: string;
  enabled: boolean;
}

// Simple configuration structure
export interface ConfigData {
  discord: DiscordChannelConfig;
  logState?: LogProcessingState;
  leaderboard?: LeaderboardConfig;
}

export interface LogProcessingState {
  lastProcessedPosition: number;
  lastProcessedTimestamp: string;
  lastUpdateTime: string;
}

export interface LeaderboardConfig {
  lastAnnouncementDate: string; // ISO date string (YYYY-MM-DD)
  enabled: boolean;
  timezone: string; // Default: "EST"
  announcementTime: string; // Default: "23:59"
}

// Environment configuration
export interface EnvironmentConfig {
  DISCORD_TOKEN: string;
  DISCORD_CHANNEL_ID: string;
  DISCORD_GUILD_ID: string;
  SERVER_NAME: string;
  FTP_HOST?: string;
  FTP_PORT?: string;
  FTP_USER?: string;
  FTP_PASSWORD?: string;
  FTP_LOG_PATH?: string;
  LOG_CHECK_INTERVAL?: string;
  TIMEZONE?: string;
  DATABASE_URL?: string;
}

// FTP configuration
export interface FtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  logPath: string;
  checkInterval: number;
  timezone: string;
}

// Storage interface implemented by DatabaseService
export interface IStorageService {
  // Player management
  getPlayer(username: string): Promise<Player | null>;
  updatePlayer(username: string, playerData: Partial<Player>): Promise<void>;
  getAllPlayers(): Promise<Player[]>;

  // Activity logging
  logActivity(activity: ActivityEvent): Promise<void>;
  getPlayerActivities(
    username: string,
    eventType?: ActivityEventType
  ): Promise<ActivityEvent[]>;
  getRecentActivity(
    username: string,
    eventType: ActivityEventType,
    withinSeconds: number
  ): Promise<ActivityEvent | null>;
  getDeathsToday(): Promise<ActivityEvent[]>;

  // Configuration management
  loadConfig(): Promise<ConfigData | null>;
  saveConfig(config: ConfigData): Promise<void>;

  // Log state management
  getLogState(): Promise<LogProcessingState | null>;
  saveLogState(state: LogProcessingState): Promise<void>;

  // Initialize with defaults
  initializeConfig(): Promise<void>;
}
