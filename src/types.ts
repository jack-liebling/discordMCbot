// Core type definitions for Discord MC Bot

// Player and activity event types
export interface Player {
  username: string;
  totalDeaths: number;
  onlineTimeMs: number;
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

// Join message tracking for deletion when players leave
export interface JoinMessage {
  id?: number;
  username: string;
  messageId: string;
  channelId: string;
  timestamp: Date;
  pendingDeletion?: boolean;
  leaveTimestamp?: Date;
}

// Pending deletion tracking for delayed message removal
export interface PendingDeletion {
  username: string;
  leaveTimestamp: Date;
  timeoutId: NodeJS.Timeout;
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
  CRAFTERS_ROLE_ID?: string;
  WHO_IS_ON_CHANNEL_ID?: string;
  ADMIN_USER_IDS?: string; // Comma-separated list of Discord user IDs
  SKIP_OLD_EVENTS_ON_STARTUP?: string; // "true" to skip old events on startup
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
  resetAllPlayerDeaths(): Promise<number>;
  deletePlayer(username: string): Promise<boolean>;

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

  // Join message tracking
  saveJoinMessage(joinMessage: JoinMessage): Promise<void>;
  getJoinMessage(username: string): Promise<JoinMessage | null>;
  deleteJoinMessage(username: string): Promise<void>;
  markJoinMessageForDeletion(
    username: string,
    leaveTimestamp: Date
  ): Promise<void>;
  cancelJoinMessageDeletion(username: string): Promise<void>;

  // Initialize with defaults
  initializeConfig(): Promise<void>;
}
