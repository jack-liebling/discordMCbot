// T008: Environment configuration loader reading .env variables
import * as dotenv from "dotenv";
import { EnvironmentConfig } from "./types";

// Load environment variables from .env file
dotenv.config();

export class ConfigLoader {
  private static instance: ConfigLoader;
  private config: EnvironmentConfig;

  private constructor() {
    this.config = this.loadEnvironmentConfig();
  }

  public static getInstance(): ConfigLoader {
    if (!ConfigLoader.instance) {
      ConfigLoader.instance = new ConfigLoader();
    }
    return ConfigLoader.instance;
  }

  private loadEnvironmentConfig(): EnvironmentConfig {
    const requiredVars = [
      "DISCORD_TOKEN",
      "DISCORD_CHANNEL_ID",
      "DISCORD_GUILD_ID",
    ];

    // Check for required variables
    for (const varName of requiredVars) {
      if (!process.env[varName]) {
        throw new Error(`Missing required environment variable: ${varName}`);
      }
    }

    return {
      DISCORD_TOKEN: process.env.DISCORD_TOKEN!,
      DISCORD_CHANNEL_ID: process.env.DISCORD_CHANNEL_ID!,
      DISCORD_GUILD_ID: process.env.DISCORD_GUILD_ID!,
      SERVER_NAME: process.env.SERVER_NAME || "Minecraft Server",
      FTP_HOST: process.env.FTP_HOST,
      FTP_PORT: process.env.FTP_PORT || "21",
      FTP_USER: process.env.FTP_USER,
      FTP_PASSWORD: process.env.FTP_PASSWORD,
      FTP_LOG_PATH: process.env.FTP_LOG_PATH,
      LOG_CHECK_INTERVAL: process.env.LOG_CHECK_INTERVAL || "10",
      TIMEZONE: process.env.TIMEZONE || "America/New_York",
      DATABASE_URL: process.env.DATABASE_URL,
      // Session notification configuration
      SESSION_NOTIFICATIONS_ENABLED:
        process.env.SESSION_NOTIFICATIONS_ENABLED || "false",
      CRAFTERS_ROLE_ID: process.env.CRAFTERS_ROLE_ID,
      WHO_IS_ON_CHANNEL_ID: process.env.WHO_IS_ON_CHANNEL_ID,
      SESSION_COOLDOWN_SECONDS: process.env.SESSION_COOLDOWN_SECONDS || "120",
    };
  }

  public getConfig(): EnvironmentConfig {
    return this.config;
  }

  public getDiscordConfig() {
    return {
      token: this.config.DISCORD_TOKEN,
      channelId: this.config.DISCORD_CHANNEL_ID,
      guildId: this.config.DISCORD_GUILD_ID,
    };
  }

  public getFtpConfig() {
    if (
      !this.config.FTP_HOST ||
      !this.config.FTP_USER ||
      !this.config.FTP_PASSWORD ||
      !this.config.FTP_LOG_PATH
    ) {
      return null;
    }

    return {
      host: this.config.FTP_HOST,
      port: parseInt(this.config.FTP_PORT || "21"),
      user: this.config.FTP_USER,
      password: this.config.FTP_PASSWORD,
      logPath: this.config.FTP_LOG_PATH,
      checkInterval: parseInt(this.config.LOG_CHECK_INTERVAL || "10"),
      timezone: this.config.TIMEZONE || "America/New_York",
    };
  }

  public getSessionNotificationConfig() {
    const enabled =
      this.config.SESSION_NOTIFICATIONS_ENABLED?.toLowerCase() === "true";

    if (!enabled) {
      return null;
    }

    if (!this.config.CRAFTERS_ROLE_ID || !this.config.WHO_IS_ON_CHANNEL_ID) {
      return null;
    }

    return {
      enabled: true,
      craftersRoleId: this.config.CRAFTERS_ROLE_ID,
      whoIsOnChannelId: this.config.WHO_IS_ON_CHANNEL_ID,
      cooldownSeconds: parseInt(this.config.SESSION_COOLDOWN_SECONDS || "120"),
    };
  }

  public validateConfig(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate Discord IDs (should be snowflake format)
    if (!/^\d{17,19}$/.test(this.config.DISCORD_CHANNEL_ID)) {
      errors.push("DISCORD_CHANNEL_ID must be a valid Discord snowflake ID");
    }

    if (!/^\d{17,19}$/.test(this.config.DISCORD_GUILD_ID)) {
      errors.push("DISCORD_GUILD_ID must be a valid Discord snowflake ID");
    }

    // Validate server name is not empty
    if (!this.config.SERVER_NAME.trim()) {
      errors.push("SERVER_NAME cannot be empty");
    }

    // Validate session notification configuration if enabled
    const sessionEnabled =
      this.config.SESSION_NOTIFICATIONS_ENABLED?.toLowerCase() === "true";
    if (sessionEnabled) {
      if (!this.config.CRAFTERS_ROLE_ID) {
        errors.push(
          "CRAFTERS_ROLE_ID is required when session notifications are enabled"
        );
      } else if (!/^\d{17,19}$/.test(this.config.CRAFTERS_ROLE_ID)) {
        errors.push("CRAFTERS_ROLE_ID must be a valid Discord snowflake ID");
      }

      if (!this.config.WHO_IS_ON_CHANNEL_ID) {
        errors.push(
          "WHO_IS_ON_CHANNEL_ID is required when session notifications are enabled"
        );
      } else if (!/^\d{17,19}$/.test(this.config.WHO_IS_ON_CHANNEL_ID)) {
        errors.push(
          "WHO_IS_ON_CHANNEL_ID must be a valid Discord snowflake ID"
        );
      }

      const cooldownSeconds = parseInt(
        this.config.SESSION_COOLDOWN_SECONDS || "120"
      );
      if (isNaN(cooldownSeconds) || cooldownSeconds < 0) {
        errors.push("SESSION_COOLDOWN_SECONDS must be a non-negative number");
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}
