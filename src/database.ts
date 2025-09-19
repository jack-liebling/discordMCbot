// Database service for PostgreSQL connection and operations
import { Pool, PoolClient } from "pg";
import {
  Player,
  ConfigData,
  LogProcessingState,
  PlayersData,
  IStorageService,
} from "./types";
import { Logger } from "./logger";

export class DatabaseService implements IStorageService {
  private readonly pool: Pool;
  private readonly logger = Logger.getInstance();
  private static instance: DatabaseService;

  constructor(databaseUrl?: string) {
    this.pool = new Pool({
      connectionString: databaseUrl || process.env.DATABASE_URL,
      ssl:
        process.env.NODE_ENV === "production"
          ? { rejectUnauthorized: false }
          : false,
    });

    // Handle pool errors
    this.pool.on("error", (err) => {
      this.logger.error("Unexpected error on idle client", err);
    });
  }

  public static getInstance(databaseUrl?: string): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService(databaseUrl);
    }
    return DatabaseService.instance;
  }

  /**
   * Safely serialize data to JSON with error handling
   */
  private safeJsonStringify(data: any): string {
    try {
      return JSON.stringify(data, (key, value) => {
        // Handle circular references
        if (typeof value === "object" && value !== null) {
          // Simple circular reference detection
          if (value.constructor === Object || Array.isArray(value)) {
            return value;
          }
          // Convert other objects to string representation
          return value.toString();
        }
        // Filter out functions and undefined values
        if (typeof value === "function" || value === undefined) {
          return null;
        }
        return value;
      });
    } catch (error) {
      this.logger.error("Failed to serialize data to JSON", error);
      // Fallback: create a basic object with only serializable properties
      try {
        const fallback = JSON.parse(
          JSON.stringify(data, Object.getOwnPropertyNames(data))
        );
        return JSON.stringify(fallback);
      } catch (fallbackError) {
        this.logger.error("Fallback serialization also failed", fallbackError);
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        throw new Error(`Unable to serialize data: ${errorMessage}`);
      }
    }
  }

  /**
   * Initialize database tables
   */
  async initialize(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await this.createTables(client);
      this.logger.info("Database initialized successfully");
    } catch (error) {
      this.logger.error("Failed to initialize database", error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create required database tables
   */
  private async createTables(client: PoolClient): Promise<void> {
    // Players table
    await client.query(`
      CREATE TABLE IF NOT EXISTS players (
        username VARCHAR(255) PRIMARY KEY,
        total_deaths INTEGER NOT NULL DEFAULT 0,
        last_death_timestamp TIMESTAMPTZ,
        first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Configuration table
    await client.query(`
      CREATE TABLE IF NOT EXISTS config (
        key VARCHAR(255) PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Create indices for better performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_players_total_deaths ON players (total_deaths DESC);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_players_last_seen ON players (last_seen_timestamp DESC);
    `);

    this.logger.info("Database tables created/verified");
  }

  /**
   * Get all players as PlayersData format
   */
  async loadPlayers(): Promise<PlayersData> {
    const players = await this.getPlayers();
    return {
      version: "1.1.0",
      lastUpdated: new Date().toISOString(),
      players,
    };
  }

  /**
   * Save players data (compatible with PlayersData format)
   */
  async savePlayers(data: PlayersData): Promise<void> {
    const players = Object.values(data.players);
    for (const player of players) {
      await this.savePlayer(player);
    }
  }

  /**
   * Get a specific player
   */
  async getPlayer(username: string): Promise<Player | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        "SELECT * FROM players WHERE username = $1",
        [username]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        username: row.username,
        totalDeaths: row.total_deaths,
        lastDeathTimestamp: row.last_death_timestamp?.toISOString(),
        firstSeen: row.first_seen.toISOString(),
        lastUpdated: row.last_updated.toISOString(),
        lastSeenTimestamp: row.last_seen_timestamp.toISOString(),
      };
    } finally {
      client.release();
    }
  }

  /**
   * Update or create a player
   */
  async updatePlayer(
    username: string,
    playerData: Partial<Player>
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      // First check if player exists
      const existingResult = await client.query(
        "SELECT * FROM players WHERE username = $1",
        [username]
      );

      if (existingResult.rows.length === 0) {
        // Create new player
        const now = new Date().toISOString();
        const newPlayer: Player = {
          username,
          totalDeaths: 0,
          lastDeathTimestamp: null,
          firstSeen: now,
          lastUpdated: now,
          lastSeenTimestamp: now,
          ...playerData,
        };
        await this.savePlayer(newPlayer);
      } else {
        // Update existing player
        const existingPlayer = {
          username: existingResult.rows[0].username,
          totalDeaths: existingResult.rows[0].total_deaths,
          lastDeathTimestamp:
            existingResult.rows[0].last_death_timestamp?.toISOString(),
          firstSeen: existingResult.rows[0].first_seen.toISOString(),
          lastUpdated: existingResult.rows[0].last_updated.toISOString(),
          lastSeenTimestamp:
            existingResult.rows[0].last_seen_timestamp.toISOString(),
        };

        const updatedPlayer = {
          ...existingPlayer,
          ...playerData,
          lastUpdated: new Date().toISOString(),
        };

        await this.savePlayer(updatedPlayer);
      }
    } finally {
      client.release();
    }
  }

  /**
   * Load configuration (compatible with existing interface)
   */
  async loadConfig(): Promise<ConfigData | null> {
    return await this.getConfig();
  }

  /**
   * Initialize configuration with defaults
   */
  async initializeConfig(): Promise<void> {
    try {
      let config = await this.loadConfig();

      // Create default config if it doesn't exist
      if (!config) {
        config = {
          discord: { channelId: "", guildId: "", enabled: true },
          leaderboard: {
            enabled: true,
            announcementTime: "09:00", // 9:00 AM
            timezone: "EST",
            lastAnnouncementDate: "1970-01-01", // Default to epoch date
          },
        };

        this.logger.info("Initialized default configuration");
        await this.saveConfig(config);
      }

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

  /**
   * Get all players
   */
  async getPlayers(): Promise<{ [username: string]: Player }> {
    const client = await this.pool.connect();
    try {
      const result = await client.query("SELECT * FROM players");
      const players: { [username: string]: Player } = {};

      for (const row of result.rows) {
        players[row.username] = {
          username: row.username,
          totalDeaths: row.total_deaths,
          lastDeathTimestamp: row.last_death_timestamp?.toISOString(),
          firstSeen: row.first_seen.toISOString(),
          lastUpdated: row.last_updated.toISOString(),
          lastSeenTimestamp: row.last_seen_timestamp.toISOString(),
        };
      }

      return players;
    } finally {
      client.release();
    }
  }

  /**
   * Save or update a player
   */
  async savePlayer(player: Player): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `
        INSERT INTO players (
          username, total_deaths, last_death_timestamp, 
          first_seen, last_updated, last_seen_timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (username) DO UPDATE SET
          total_deaths = EXCLUDED.total_deaths,
          last_death_timestamp = EXCLUDED.last_death_timestamp,
          last_updated = EXCLUDED.last_updated,
          last_seen_timestamp = EXCLUDED.last_seen_timestamp
      `,
        [
          player.username,
          player.totalDeaths,
          player.lastDeathTimestamp
            ? new Date(player.lastDeathTimestamp)
            : null,
          new Date(player.firstSeen),
          new Date(player.lastUpdated),
          new Date(player.lastSeenTimestamp),
        ]
      );
    } finally {
      client.release();
    }
  }

  /**
   * Get configuration
   */
  async getConfig(): Promise<ConfigData | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        "SELECT value FROM config WHERE key = $1",
        ["app_config"]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0].value;
    } finally {
      client.release();
    }
  }

  /**
   * Save configuration
   */
  async saveConfig(config: ConfigData): Promise<void> {
    const client = await this.pool.connect();
    try {
      const serializedConfig = this.safeJsonStringify(config);
      await client.query(
        `
        INSERT INTO config (key, value, updated_at) VALUES ($1, $2, NOW())
        ON CONFLICT (key) DO UPDATE SET
          value = EXCLUDED.value,
          updated_at = EXCLUDED.updated_at
      `,
        ["app_config", serializedConfig]
      );
    } catch (error) {
      this.logger.error("Failed to save config to database", error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get log processing state
   */
  async getLogState(): Promise<LogProcessingState | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        "SELECT value FROM config WHERE key = $1",
        ["log_state"]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0].value as LogProcessingState;
    } catch (error) {
      this.logger.error("Failed to get log state from database", error);
      return null;
    } finally {
      client.release();
    }
  }

  /**
   * Save log processing state
   */
  async saveLogState(state: LogProcessingState): Promise<void> {
    const client = await this.pool.connect();
    try {
      const serializedState = this.safeJsonStringify(state);
      await client.query(
        `INSERT INTO config (key, value) 
         VALUES ($1, $2) 
         ON CONFLICT (key) 
         DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
        ["log_state", serializedState]
      );

      this.logger.debug("Log state saved to database");
    } catch (error) {
      this.logger.error("Failed to save log state to database", error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    await this.pool.end();
    this.logger.info("Database connection closed");
  }

  /**
   * Test database connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const client = await this.pool.connect();
      await client.query("SELECT 1");
      client.release();
      return true;
    } catch (error) {
      this.logger.error("Database connection test failed", error);
      return false;
    }
  }
}
