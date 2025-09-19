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

// Storage interface implemented by DatabaseService
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
}
