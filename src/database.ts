// Database service for PostgreSQL connection and operations
import { Pool, PoolClient } from "pg";
import { Player, ConfigData } from "./types";
import { Logger } from "./logger";

export class DatabaseService {
  private pool: Pool;
  private logger = Logger.getInstance();
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
      await client.query(
        `
        INSERT INTO config (key, value, updated_at) VALUES ($1, $2, NOW())
        ON CONFLICT (key) DO UPDATE SET
          value = EXCLUDED.value,
          updated_at = EXCLUDED.updated_at
      `,
        ["app_config", JSON.stringify(config)]
      );
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
