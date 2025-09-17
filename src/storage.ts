// T007: JSON file storage service for players.json and config.json
import { promises as fs } from "fs";
import { join } from "path";
import {
  PlayersData,
  ConfigData,
  Player,
  LogProcessingState,
  LeaderboardConfig,
  IStorageService,
} from "./types";
import { Logger } from "./logger";

export class StorageService implements IStorageService {
  private readonly playersFile = join(process.cwd(), "players.json");
  private readonly configFile = join(process.cwd(), "config.json");
  private readonly logger = Logger.getInstance();

  // Player data management
  async loadPlayers(): Promise<PlayersData> {
    try {
      const data = await fs.readFile(this.playersFile, "utf-8");
      const parsed = JSON.parse(data) as PlayersData;

      // Convert date strings back to Date objects and handle migration
      // No date conversion needed - we're keeping dates as ISO strings now
      // Just ensure lastSeenTimestamp exists for migration
      Object.values(parsed.players).forEach((player) => {
        if (!player.lastSeenTimestamp) {
          player.lastSeenTimestamp = player.lastUpdated;
        }
      });

      // Update version if migration occurred
      if (parsed.version !== "1.1.0") {
        parsed.version = "1.1.0";
        await this.savePlayers(parsed);
      }

      return parsed;
    } catch (error) {
      this.logger.warn(
        "Failed to load players file, using empty structure:",
        error
      );
      // Return empty structure if file doesn't exist or is invalid
      return {
        version: "1.1.0",
        lastUpdated: new Date().toISOString(),
        players: {},
      };
    }
  }

  async savePlayers(data: PlayersData): Promise<void> {
    data.lastUpdated = new Date().toISOString();
    await fs.writeFile(
      this.playersFile,
      JSON.stringify(data, null, 2),
      "utf-8"
    );
  }

  async updatePlayer(
    username: string,
    updates: Partial<Player>
  ): Promise<void> {
    const data = await this.loadPlayers();

    if (!data.players[username]) {
      const now = new Date().toISOString();
      data.players[username] = {
        username,
        totalDeaths: 0,
        lastDeathTimestamp: null,
        firstSeen: now,
        lastUpdated: now,
        lastSeenTimestamp: now,
      };
    }

    data.players[username] = {
      ...data.players[username],
      ...updates,
      lastUpdated: new Date().toISOString(),
    };

    await this.savePlayers(data);
  }

  async getPlayer(username: string): Promise<Player | null> {
    const data = await this.loadPlayers();
    return data.players[username] || null;
  }

  // Configuration management
  async loadConfig(): Promise<ConfigData | null> {
    try {
      const data = await fs.readFile(this.configFile, "utf-8");
      return JSON.parse(data) as ConfigData;
    } catch (error) {
      this.logger.warn("Failed to load config file:", error);
      return null;
    }
  }

  async saveConfig(config: ConfigData): Promise<void> {
    await fs.writeFile(
      this.configFile,
      JSON.stringify(config, null, 2),
      "utf-8"
    );
  }

  // Log processing state management
  async getLogState(): Promise<LogProcessingState | null> {
    try {
      const config = await this.loadConfig();
      return config?.logState || null;
    } catch (error) {
      this.logger.warn("Failed to get log state:", error);
      return null;
    }
  }

  async saveLogState(state: LogProcessingState): Promise<void> {
    try {
      let config = await this.loadConfig();
      config ??= {
        discord: { channelId: "", guildId: "", enabled: true },
      };

      config.logState = state;
      await this.saveConfig(config);
    } catch (error) {
      console.error("Failed to save log state:", error);
    }
  }

  // Leaderboard configuration management
  async getLeaderboardConfig(): Promise<LeaderboardConfig | null> {
    try {
      const config = await this.loadConfig();
      return config?.leaderboard || null;
    } catch (error) {
      this.logger.warn("Failed to get leaderboard config:", error);
      return null;
    }
  }

  async saveLeaderboardConfig(
    leaderboardConfig: LeaderboardConfig
  ): Promise<void> {
    try {
      let config = await this.loadConfig();
      config ??= {
        discord: { channelId: "", guildId: "", enabled: true },
      };

      config.leaderboard = leaderboardConfig;
      await this.saveConfig(config);
    } catch (error) {
      this.logger.error("Failed to save leaderboard config:", error);
    }
  }

  // Player activity tracking
  async updatePlayerLastSeen(username: string): Promise<void> {
    const data = await this.loadPlayers();

    if (data.players[username]) {
      data.players[username].lastSeenTimestamp = new Date().toISOString();
      data.players[username].lastUpdated = new Date().toISOString();
      await this.savePlayers(data);
    }
  }

  // Configuration initialization and migration
  async initializeConfig(): Promise<void> {
    try {
      let config = await this.loadConfig();

      // Create default config if it doesn't exist
      config ??= {
        discord: { channelId: "", guildId: "", enabled: true },
      };

      // Initialize leaderboard config with defaults if missing
      if (!config.leaderboard) {
        config.leaderboard = {
          enabled: true,
          announcementTime: "09:00", // 9:00 AM
          timezone: "EST",
          lastAnnouncementDate: "1970-01-01", // Default to epoch date
        };

        this.logger.info("Initialized default leaderboard configuration");
        await this.saveConfig(config);
      }
    } catch (error) {
      this.logger.error("Failed to initialize configuration:", error);
    }
  }

  // Utility methods
  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async createBackup(filePath: string): Promise<void> {
    const backupPath = `${filePath}.backup.${Date.now()}`;
    try {
      await fs.copyFile(filePath, backupPath);
    } catch (error) {
      // Backup creation is optional, don't fail the operation
      console.warn(`Failed to create backup for ${filePath}:`, error);
    }
  }
}
