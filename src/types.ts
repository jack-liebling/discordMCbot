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
  lastDeathTimestamp: Date | null;
  firstSeen: Date;
  lastUpdated: Date;
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
