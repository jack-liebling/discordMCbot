// Core type definitions for Discord MC Bot

// T004: DeathEvent and Player interfaces
export interface DeathEvent {
  playerId: string;
  timestamp: Date;
  cause: string;
  experienceLevel: number;
  serverName: string;
}

export interface Player {
  username: string;
  totalDeaths: number;
  lastDeathTimestamp: string | null;
  firstSeen: string;
  lastUpdated: string;
  lastSeenTimestamp: string;
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

// T005: DiscordChannelConfig interface
export interface DiscordChannelConfig {
  channelId: string;
  guildId: string;
  enabled: boolean;
  lastMessageId?: string;
}

// Data storage schemas
export interface PlayersData {
  version: string;
  lastUpdated: string;
  players: Record<string, Player>;
}

export interface LogProcessingState {
  lastProcessedPosition: number;
  lastProcessedTimestamp: string;
  lastUpdateTime: string;
}

export interface ConfigData {
  discord: DiscordChannelConfig;
  logState?: LogProcessingState;
  leaderboard?: LeaderboardConfig;
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

// Storage interface that both StorageService and HybridStorageService implement
export interface IStorageService {
  // Player management
  getPlayer(username: string): Promise<Player | null>;
  updatePlayer(username: string, playerData: Partial<Player>): Promise<void>;
  loadPlayers(): Promise<PlayersData>;
  savePlayers(data: PlayersData): Promise<void>;

  // Configuration management
  loadConfig(): Promise<ConfigData | null>;
  saveConfig(config: ConfigData): Promise<void>;

  // Log state management
  getLogState(): Promise<LogProcessingState | null>;
  saveLogState(state: LogProcessingState): Promise<void>;

  // Activity management
  storeActivity(activity: NewPlayerActivity): Promise<void>;
  getPlayerActivities(
    username: string,
    activityType?: ActivityType
  ): Promise<PlayerActivity[]>;
  storeDeath(death: DeathEvent): Promise<void>;
}

// Enhanced Player Activity Tracking Types

export type ActivityType = "JOIN" | "LEAVE" | "CHAT" | "ACHIEVEMENT" | "DEATH";

export interface PlayerActivity {
  id: number;
  username: string;
  activity_type: ActivityType;
  timestamp: Date;
  metadata?: ActivityMetadata;
  created_at: Date;
}

export interface NewPlayerActivity {
  username: string;
  activity_type: ActivityType;
  timestamp: Date;
  metadata?: ActivityMetadata;
}

export type ActivityMetadata =
  | JoinMetadata
  | LeaveMetadata
  | ChatMetadata
  | AchievementMetadata
  | DeathMetadata;

export interface JoinMetadata {
  coordinates?: { x: number; y: number; z: number };
  dimension?: string;
  ip_address?: string;
  entity_id?: number;
}

export interface LeaveMetadata {
  reason?: string;
  duration_ms?: number;
}

export interface ChatMetadata {
  message_length: number;
  contains_mention?: boolean;
  thread_info?: string;
}

export interface AchievementMetadata {
  advancement_name: string;
  advancement_category?: string;
  is_first_time?: boolean;
}

export interface DeathMetadata {
  cause: string;
  coordinates?: { x: number; y: number; z: number };
  experience_level?: number;
  items_lost?: number;
}

export interface ActivitySession {
  session_id: string;
  username: string;
  start_timestamp: Date;
  end_timestamp: Date | null;
  duration_ms: number | null;
  activities_during_session: PlayerActivity[];
  achievements_earned: number;
  chat_messages_sent: number;
  deaths_occurred: number;
}

export interface EnhancedPlayerStats {
  // Existing player fields
  username: string;
  totalDeaths: number;
  lastDeathTimestamp: string | null;
  firstSeen: string;
  lastUpdated: string;
  lastSeenTimestamp: string;

  // New calculated fields
  totalSessions: number;
  totalPlaytimeMs: number;
  totalChatMessages: number;
  totalAchievements: number;
  lastActivityTimestamp: string;
  activityBreakdown: Record<ActivityType, number>;
}

export interface ActivityQueryOptions {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
  orderBy?: "timestamp" | "activity_type";
  orderDirection?: "ASC" | "DESC";
}

export interface SessionQueryOptions {
  startDate?: Date;
  endDate?: Date;
  includeOngoing?: boolean;
  minDurationMs?: number;
}

export interface TimeRange {
  startDate: Date;
  endDate: Date;
}

export interface ActivitySummary {
  totalActivities: number;
  activePlayersCount: number;
  activityBreakdown: Record<ActivityType, number>;
  averageSessionDuration: number;
  mostActivePlayer: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  orphanedJoins: number;
  orphanedLeaves: number;
}

// Database Migration Types
export interface Migration {
  version: number;
  name: string;
  description: string;
  up: (client: any) => Promise<void>;
  down?: (client: any) => Promise<void>;
}

export interface SchemaVersion {
  version: number;
  applied_at: Date;
  migration_name: string;
  description: string;
  success: boolean;
  error_message?: string;
}
