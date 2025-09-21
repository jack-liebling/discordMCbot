// Database service for PostgreSQL connection and operations
import { Pool, PoolClient } from "pg";
import {
  Player,
  ConfigData,
  LogProcessingState,
  IStorageService,
  ActivityEvent,
  ActivityEventType,
  JoinMessage,
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
    // Players table - tracks basic player stats
    await client.query(`
      CREATE TABLE IF NOT EXISTS players (
        username VARCHAR(255) PRIMARY KEY,
        total_deaths INTEGER NOT NULL DEFAULT 0,
        online_time_ms BIGINT NOT NULL DEFAULT 0,
        last_join TIMESTAMPTZ,
        last_leave TIMESTAMPTZ,
        last_life_duration_ms BIGINT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Activity log table - tracks all player events
    await client.query(`
      CREATE TABLE IF NOT EXISTS activity_log (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) NOT NULL,
        event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('JOIN', 'LEAVE', 'DEATH', 'ACHIEVEMENT')),
        timestamp TIMESTAMPTZ NOT NULL,
        details TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Configuration table - minimal config storage
    await client.query(`
      CREATE TABLE IF NOT EXISTS config (
        key VARCHAR(255) PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Join messages table - tracks Discord messages for deletion when players leave
    await client.query(`
      CREATE TABLE IF NOT EXISTS join_messages (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) NOT NULL UNIQUE,
        message_id VARCHAR(255) NOT NULL,
        channel_id VARCHAR(255) NOT NULL,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        pending_deletion BOOLEAN DEFAULT FALSE,
        leave_timestamp TIMESTAMPTZ
      )
    `);

    // Create indices for better performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_players_total_deaths ON players (total_deaths DESC);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_activity_log_username ON activity_log (username);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_activity_log_event_type ON activity_log (event_type);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_activity_log_timestamp ON activity_log (timestamp DESC);
    `);

    // Migration: Add new columns to existing join_messages table if they don't exist
    try {
      // Check if columns exist first
      const result = await client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'join_messages' 
        AND column_name IN ('pending_deletion', 'leave_timestamp')
      `);

      const existingColumns = result.rows.map((row) => row.column_name);

      if (!existingColumns.includes("pending_deletion")) {
        await client.query(
          `ALTER TABLE join_messages ADD COLUMN pending_deletion BOOLEAN DEFAULT FALSE`
        );
        this.logger.debug(
          "Added pending_deletion column to join_messages table"
        );
      }

      if (!existingColumns.includes("leave_timestamp")) {
        await client.query(
          `ALTER TABLE join_messages ADD COLUMN leave_timestamp TIMESTAMPTZ`
        );
        this.logger.debug(
          "Added leave_timestamp column to join_messages table"
        );
      }

      this.logger.debug("Join messages table migration completed");
    } catch (error) {
      this.logger.error("Join messages table migration failed", error);
      throw error;
    }

    // Migration: Add online_time_ms column to existing players table if it doesn't exist
    try {
      const result = await client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'players' 
        AND column_name = 'online_time_ms'
      `);

      if (result.rows.length === 0) {
        await client.query(
          `ALTER TABLE players ADD COLUMN online_time_ms BIGINT DEFAULT 0`
        );
        this.logger.debug("Added online_time_ms column to players table");
      }

      this.logger.debug("Players table migration completed");
    } catch (error) {
      this.logger.error("Players table migration failed", error);
      throw error;
    }

    // Migration: Add last_life_duration_ms column to existing players table if it doesn't exist
    try {
      const result = await client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'players' 
        AND column_name = 'last_life_duration_ms'
      `);

      if (result.rows.length === 0) {
        await client.query(
          `ALTER TABLE players ADD COLUMN last_life_duration_ms BIGINT DEFAULT 0`
        );
        this.logger.debug(
          "Added last_life_duration_ms column to players table"
        );
      }

      this.logger.debug("Players table last life duration migration completed");
    } catch (error) {
      this.logger.error(
        "Players table last life duration migration failed",
        error
      );
      throw error;
    }

    this.logger.info("Database tables created/verified");
  }

  /**
   * Get all players
   */
  async getAllPlayers(): Promise<Player[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        "SELECT * FROM players ORDER BY total_deaths DESC"
      );

      return result.rows.map((row) => ({
        username: row.username,
        totalDeaths: row.total_deaths,
        onlineTimeMs: parseInt(row.online_time_ms) || 0,
        lastJoin: row.last_join,
        lastLeave: row.last_leave,
        lastLifeDurationMs: parseInt(row.last_life_duration_ms) || 0,
        createdAt: row.created_at,
      }));
    } finally {
      client.release();
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
        onlineTimeMs: parseInt(row.online_time_ms) || 0,
        lastJoin: row.last_join,
        lastLeave: row.last_leave,
        lastLifeDurationMs: parseInt(row.last_life_duration_ms) || 0,
        createdAt: row.created_at,
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
      // Use UPSERT with ON CONFLICT to handle race conditions
      // This ensures atomic insert-or-update without race conditions

      const updateFields = [];
      const values: any[] = [username];
      let paramIndex = 2;

      // Build the SET clause for updates
      if (playerData.totalDeaths !== undefined) {
        updateFields.push(`total_deaths = $${paramIndex}`);
        values.push(playerData.totalDeaths);
        paramIndex++;
      }

      if (playerData.onlineTimeMs !== undefined) {
        updateFields.push(`online_time_ms = $${paramIndex}`);
        values.push(playerData.onlineTimeMs);
        paramIndex++;
      }

      if (playerData.lastJoin !== undefined) {
        updateFields.push(`last_join = $${paramIndex}`);
        values.push(playerData.lastJoin);
        paramIndex++;
      }

      if (playerData.lastLeave !== undefined) {
        updateFields.push(`last_leave = $${paramIndex}`);
        values.push(playerData.lastLeave);
        paramIndex++;
      }

      if (playerData.lastLifeDurationMs !== undefined) {
        updateFields.push(`last_life_duration_ms = $${paramIndex}`);
        values.push(playerData.lastLifeDurationMs);
        paramIndex++;
      }

      if (updateFields.length > 0) {
        // UPSERT: Insert new player or update existing one atomically
        const query = `
          INSERT INTO players (username, total_deaths, online_time_ms, last_join, last_leave, last_life_duration_ms, created_at)
          VALUES ($1, $${paramIndex}, $${paramIndex + 1}, $${
          paramIndex + 2
        }, $${paramIndex + 3}, $${paramIndex + 4}, NOW())
          ON CONFLICT (username) DO UPDATE SET
            ${updateFields.join(", ")}
        `;

        values.push(
          playerData.totalDeaths ?? 0,
          playerData.onlineTimeMs ?? 0,
          playerData.lastJoin ?? null,
          playerData.lastLeave ?? null,
          playerData.lastLifeDurationMs ?? 0
        );

        await client.query(query, values);
        this.logger.debug(
          `Upserted player ${username} with updates: ${updateFields.join(", ")}`
        );
      } else {
        // Just ensure player exists if no specific updates
        const result = await client.query(
          `
          INSERT INTO players (username, total_deaths, online_time_ms, last_join, last_leave, last_life_duration_ms, created_at)
          VALUES ($1, 0, 0, NULL, NULL, 0, NOW())
          ON CONFLICT (username) DO NOTHING
          RETURNING username
        `,
          [username]
        );

        if (result.rows.length > 0) {
          this.logger.info(`Created new player record for ${username}`);
        } else {
          this.logger.debug(
            `Player ${username} already exists, no update needed`
          );
        }
      }
    } finally {
      client.release();
    }
  }

  /**
   * Reset all player death counts to zero
   */
  async resetAllPlayerDeaths(): Promise<number> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        "UPDATE players SET total_deaths = 0 WHERE total_deaths > 0"
      );

      const resetCount = result.rowCount || 0;
      this.logger.info(`Reset death counts for ${resetCount} players`);
      return resetCount;
    } finally {
      client.release();
    }
  }

  /**
   * Delete a player from the database completely
   */
  async deletePlayer(username: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      // First check if player exists
      const checkResult = await client.query(
        "SELECT username FROM players WHERE username = $1",
        [username]
      );

      if (checkResult.rows.length === 0) {
        this.logger.info(`Player ${username} not found in database`);
        return false;
      }

      // Delete from players table (CASCADE should handle related records)
      const deleteResult = await client.query(
        "DELETE FROM players WHERE username = $1",
        [username]
      );

      const deleted = (deleteResult.rowCount || 0) > 0;
      if (deleted) {
        this.logger.info(
          `Successfully deleted player ${username} from database`
        );
      }
      return deleted;
    } finally {
      client.release();
    }
  }

  /**
   * Subtract one death from a player's total (for PvP kill rewards)
   */
  async subtractPlayerDeath(username: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Only subtract if player has at least 1 death to prevent negative counts
      const result = await client.query(
        `UPDATE players 
         SET total_deaths = GREATEST(total_deaths - 1, 0)
         WHERE username = $1 AND total_deaths > 0
         RETURNING total_deaths`,
        [username]
      );

      if (result.rows.length > 0) {
        const newDeathCount = result.rows[0].total_deaths;
        this.logger.info(
          `Subtracted 1 death from ${username} (PvP kill reward). New total: ${newDeathCount}`
        );
      } else {
        this.logger.debug(
          `No death subtracted for ${username} - player has 0 deaths or doesn't exist`
        );
      }
    } finally {
      client.release();
    }
  }

  /**
   * Log a player activity event
   */
  async logActivity(activity: ActivityEvent): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO activity_log (username, event_type, timestamp, details)
         VALUES ($1, $2, $3, $4)`,
        [
          activity.username,
          activity.eventType,
          activity.timestamp,
          activity.details || null,
        ]
      );

      this.logger.debug(
        `Activity logged: ${activity.username} ${activity.eventType}`
      );
    } finally {
      client.release();
    }
  }

  /**
   * Get player activities
   */
  async getPlayerActivities(
    username: string,
    eventType?: ActivityEventType
  ): Promise<ActivityEvent[]> {
    const client = await this.pool.connect();
    try {
      let query = "SELECT * FROM activity_log WHERE username = $1";
      const params: any[] = [username];

      if (eventType) {
        query += " AND event_type = $2";
        params.push(eventType);
      }

      query += " ORDER BY timestamp DESC";

      const result = await client.query(query, params);

      return result.rows.map((row) => ({
        id: row.id,
        username: row.username,
        eventType: row.event_type as ActivityEventType,
        timestamp: row.timestamp,
        details: row.details,
        createdAt: row.created_at,
      }));
    } finally {
      client.release();
    }
  }

  async getRecentActivity(
    username: string,
    eventType: ActivityEventType,
    withinSeconds: number
  ): Promise<ActivityEvent | null> {
    const client = await this.pool.connect();
    try {
      const query = `
        SELECT * FROM activity_log 
        WHERE username = $1 
        AND event_type = $2 
        AND timestamp >= NOW() - INTERVAL '${withinSeconds} seconds'
        ORDER BY timestamp DESC 
        LIMIT 1
      `;

      const result = await client.query(query, [username, eventType]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        username: row.username,
        eventType: row.event_type as ActivityEventType,
        timestamp: row.timestamp,
        details: row.details,
        createdAt: row.created_at,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get today's death events for leaderboard
   */
  async getDeathsToday(): Promise<ActivityEvent[]> {
    const client = await this.pool.connect();
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const result = await client.query(
        `SELECT * FROM activity_log 
         WHERE event_type = 'DEATH' 
         AND timestamp >= $1 
         ORDER BY timestamp DESC`,
        [today]
      );

      return result.rows.map((row) => ({
        id: row.id,
        username: row.username,
        eventType: row.event_type as ActivityEventType,
        timestamp: row.timestamp,
        details: row.details,
        createdAt: row.created_at,
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Get configuration
   */
  async loadConfig(): Promise<ConfigData | null> {
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
      await client.query(
        `INSERT INTO config (key, value) 
         VALUES ($1, $2) 
         ON CONFLICT (key) 
         DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
        ["log_state", JSON.stringify(state)]
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
            announcementTime: "23:59", // 11:59 PM
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
          announcementTime: "23:59", // 11:59 PM
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
   * Save a Discord join message for later deletion
   */
  async saveJoinMessage(joinMessage: JoinMessage): Promise<void> {
    try {
      const query = `
        INSERT INTO join_messages (username, message_id, channel_id, timestamp, pending_deletion, leave_timestamp)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (username) DO UPDATE SET
          message_id = EXCLUDED.message_id,
          channel_id = EXCLUDED.channel_id,
          timestamp = EXCLUDED.timestamp,
          pending_deletion = EXCLUDED.pending_deletion,
          leave_timestamp = EXCLUDED.leave_timestamp
      `;

      await this.pool.query(query, [
        joinMessage.username,
        joinMessage.messageId,
        joinMessage.channelId,
        joinMessage.timestamp,
        joinMessage.pendingDeletion || false,
        joinMessage.leaveTimestamp || null,
      ]);

      this.logger.debug(
        `Saved join message for player ${joinMessage.username}`
      );
    } catch (error) {
      this.logger.error(
        `Failed to save join message for ${joinMessage.username}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get a Discord join message for deletion
   */
  async getJoinMessage(playerName: string): Promise<JoinMessage | null> {
    try {
      const query = `
        SELECT username, message_id, channel_id, timestamp, pending_deletion, leave_timestamp
        FROM join_messages
        WHERE username = $1
      `;

      const result = await this.pool.query(query, [playerName]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        username: row.username,
        messageId: row.message_id,
        channelId: row.channel_id,
        timestamp: row.timestamp,
        pendingDeletion: row.pending_deletion,
        leaveTimestamp: row.leave_timestamp,
      };
    } catch (error) {
      this.logger.error(`Failed to get join message for ${playerName}:`, error);
      throw error;
    }
  }

  /**
   * Delete a Discord join message record
   */
  async deleteJoinMessage(playerName: string): Promise<void> {
    try {
      const query = `DELETE FROM join_messages WHERE username = $1`;
      await this.pool.query(query, [playerName]);
      this.logger.debug(`Deleted join message record for player ${playerName}`);
    } catch (error) {
      this.logger.error(
        `Failed to delete join message for ${playerName}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Clear all join messages from the database
   */
  async clearAllJoinMessages(): Promise<number> {
    const client = await this.pool.connect();
    try {
      const result = await client.query("DELETE FROM join_messages");
      const deletedCount = result.rowCount || 0;
      this.logger.info(`Cleared ${deletedCount} join messages from database`);
      return deletedCount;
    } finally {
      client.release();
    }
  }

  /**
   * Mark a join message as pending deletion
   */
  async markJoinMessageForDeletion(
    playerName: string,
    leaveTimestamp: Date
  ): Promise<void> {
    try {
      const query = `
        UPDATE join_messages 
        SET pending_deletion = TRUE, leave_timestamp = $2
        WHERE username = $1
      `;
      await this.pool.query(query, [playerName, leaveTimestamp]);
      this.logger.debug(`Marked join message for deletion: ${playerName}`);
    } catch (error) {
      this.logger.error(
        `Failed to mark join message for deletion for ${playerName}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Cancel pending deletion for a join message (when player rejoins)
   */
  async cancelJoinMessageDeletion(playerName: string): Promise<void> {
    try {
      const query = `
        UPDATE join_messages 
        SET pending_deletion = FALSE, leave_timestamp = NULL
        WHERE username = $1
      `;
      await this.pool.query(query, [playerName]);
      this.logger.debug(`Cancelled join message deletion: ${playerName}`);
    } catch (error) {
      this.logger.error(
        `Failed to cancel join message deletion for ${playerName}:`,
        error
      );
      throw error;
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
