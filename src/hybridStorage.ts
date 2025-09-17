// Hybrid storage service supporting both PostgreSQL and JSON file storage
import { DatabaseService } from "./database";
import { StorageService as JsonStorageService } from "./storage";
import { Player, ConfigData, PlayersData } from "./types";
import { Logger } from "./logger";

export class HybridStorageService {
  private dbService?: DatabaseService;
  private jsonService?: JsonStorageService;
  private logger = Logger.getInstance();
  private useDatabase: boolean;

  constructor(databaseUrl?: string) {
    this.useDatabase = !!(databaseUrl || process.env.DATABASE_URL);

    if (this.useDatabase) {
      this.dbService = DatabaseService.getInstance(databaseUrl);
      this.logger.info("Using PostgreSQL database for storage");
    } else {
      this.jsonService = new JsonStorageService();
      this.logger.info("Using JSON files for storage (local development)");
    }
  }

  /**
   * Initialize storage system
   */
  async initialize(): Promise<void> {
    if (this.useDatabase && this.dbService) {
      await this.dbService.initialize();
      await this.testDatabaseConnection();
    } else if (this.jsonService) {
      await this.jsonService.initializeConfig();
    }
  }

  /**
   * Test database connection and fallback to JSON if needed
   */
  private async testDatabaseConnection(): Promise<void> {
    if (!this.dbService) return;

    const isConnected = await this.dbService.testConnection();
    if (!isConnected) {
      this.logger.warn(
        "Database connection failed, falling back to JSON storage"
      );
      this.useDatabase = false;
      this.jsonService = new JsonStorageService();
      await this.jsonService.initializeConfig();
    }
  }

  /**
   * Load players data
   */
  async loadPlayers(): Promise<PlayersData> {
    if (this.useDatabase && this.dbService) {
      try {
        const players = await this.dbService.getPlayers();
        return {
          version: "1.1.0",
          lastUpdated: new Date().toISOString(),
          players,
        };
      } catch (error) {
        this.logger.error(
          "Failed to load players from database, falling back to JSON",
          error
        );
        await this.fallbackToJson();
        return this.jsonService!.loadPlayers();
      }
    } else {
      return this.jsonService!.loadPlayers();
    }
  }

  /**
   * Save players data
   */
  async savePlayers(data: PlayersData): Promise<void> {
    if (this.useDatabase && this.dbService) {
      try {
        // Save each player individually
        const players = Object.values(data.players);
        for (const player of players) {
          await this.dbService.savePlayer(player);
        }
      } catch (error) {
        this.logger.error(
          "Failed to save players to database, falling back to JSON",
          error
        );
        await this.fallbackToJson();
        await this.jsonService!.savePlayers(data);
      }
    } else {
      await this.jsonService!.savePlayers(data);
    }
  }

  /**
   * Update or create a player
   */
  async updatePlayer(
    username: string,
    playerData: Partial<Player>
  ): Promise<void> {
    // Load current players
    const data = await this.loadPlayers();

    // Update or create player
    if (data.players[username]) {
      // Update existing player
      data.players[username] = {
        ...data.players[username],
        ...playerData,
        lastUpdated: new Date().toISOString(),
      } as Player;
    } else {
      // Create new player
      data.players[username] = {
        username,
        totalDeaths: 0,
        lastDeathTimestamp: null,
        firstSeen: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        lastSeenTimestamp: new Date().toISOString(),
        ...playerData,
      } as Player;
    }

    data.lastUpdated = new Date().toISOString();

    // Save updated data
    await this.savePlayers(data);
  }

  /**
   * Get a specific player's data
   */
  async getPlayer(username: string): Promise<Player | null> {
    const data = await this.loadPlayers();
    return data.players[username] || null;
  }

  /**
   * Get log processing state
   */
  async getLogState(): Promise<any> {
    if (this.useDatabase && this.dbService) {
      // For database, log state might be stored differently
      // For now, fallback to JSON
      await this.fallbackToJson();
    }

    if (this.jsonService) {
      return await this.jsonService.getLogState();
    }
    return null;
  }

  /**
   * Save log processing state
   */
  async saveLogState(state: any): Promise<void> {
    if (this.useDatabase && this.dbService) {
      // For database, log state might be stored differently
      // For now, fallback to JSON
      await this.fallbackToJson();
    }

    if (this.jsonService) {
      await this.jsonService.saveLogState(state);
    }
  }

  /**
   * Update player's last seen timestamp
   */
  async updatePlayerLastSeen(username: string): Promise<void> {
    await this.updatePlayer(username, {
      lastSeenTimestamp: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    });
  }

  /**
   * Get leaderboard configuration
   */
  async getLeaderboardConfig(): Promise<any> {
    const config = await this.loadConfig();
    return config?.leaderboard || null;
  }

  /**
   * Save leaderboard configuration
   */
  async saveLeaderboardConfig(leaderboardConfig: any): Promise<void> {
    let config = await this.loadConfig();
    config ??= {
      discord: { channelId: "", guildId: "", enabled: true },
    };
    config.leaderboard = leaderboardConfig;
    await this.saveConfig(config);
  }

  /**
   * Check if file exists (for compatibility)
   */
  async fileExists(filePath: string): Promise<boolean> {
    if (this.jsonService) {
      return this.jsonService.fileExists(filePath);
    }
    return false;
  }

  /**
   * Create backup (for compatibility)
   */
  async createBackup(filePath: string): Promise<void> {
    if (this.jsonService) {
      await this.jsonService.createBackup(filePath);
    }
  }

  /**
   * Load configuration
   */
  async loadConfig(): Promise<ConfigData> {
    if (this.useDatabase && this.dbService) {
      try {
        const config = await this.dbService.getConfig();
        if (config) {
          return config;
        }
        // If no config in database, create default
        const defaultConfig = this.createDefaultConfig();
        await this.dbService.saveConfig(defaultConfig);
        return defaultConfig;
      } catch (error) {
        this.logger.error(
          "Failed to load config from database, falling back to JSON",
          error
        );
        await this.fallbackToJson();
        const config = await this.jsonService!.loadConfig();
        return config || this.createDefaultConfig();
      }
    } else {
      const config = await this.jsonService!.loadConfig();
      return config || this.createDefaultConfig();
    }
  }

  /**
   * Save configuration
   */
  async saveConfig(config: ConfigData): Promise<void> {
    if (this.useDatabase && this.dbService) {
      try {
        await this.dbService.saveConfig(config);
      } catch (error) {
        this.logger.error(
          "Failed to save config to database, falling back to JSON",
          error
        );
        await this.fallbackToJson();
        await this.jsonService!.saveConfig(config);
      }
    } else {
      await this.jsonService!.saveConfig(config);
    }
  }

  /**
   * Initialize configuration with defaults
   */
  async initializeConfig(): Promise<void> {
    await this.loadConfig(); // This will create defaults if needed
    this.logger.info("Configuration initialized");
  }

  /**
   * Fallback to JSON storage
   */
  private async fallbackToJson(): Promise<void> {
    if (!this.jsonService) {
      this.useDatabase = false;
      this.jsonService = new JsonStorageService();
      await this.jsonService.initializeConfig();
    }
  }

  /**
   * Create default configuration
   */
  private createDefaultConfig(): ConfigData {
    return {
      discord: {
        channelId: process.env.DISCORD_CHANNEL_ID || "",
        guildId: process.env.DISCORD_GUILD_ID || "",
        enabled: true,
      },
      leaderboard: {
        enabled: true,
        announcementTime: "09:00",
        timezone: "EST",
        lastAnnouncementDate: "1970-01-01",
      },
    };
  }

  /**
   * Close connections
   */
  async close(): Promise<void> {
    if (this.dbService) {
      await this.dbService.close();
    }
  }

  /**
   * Check if using database
   */
  isUsingDatabase(): boolean {
    return this.useDatabase;
  }
}
