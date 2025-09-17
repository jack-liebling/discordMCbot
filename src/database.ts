// Database service for PostgreSQL connection and operations
import { Pool, PoolClient } from "pg";
import {
  Player,
  ConfigData,
  LogProcessingState,
  NewPlayerActivity,
  ActivityType,
  PlayerActivity,
  DeathEvent,
  Migration,
  SchemaVersion,
  SessionNotificationData,
  NotificationRecord,
  CooldownStatus,
} from "./types";
import { Logger } from "./logger";

export class DatabaseService {
  private pool: Pool;
  private logger = Logger.getInstance();
  private static instance: DatabaseService;
  private static readonly CURRENT_SCHEMA_VERSION = 3; // Version 3 includes session notifications

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
   * Initialize database with migration support
   */
  async initialize(): Promise<void> {
    const client = await this.pool.connect();
    try {
      // First, ensure the schema_versions table exists
      await this.createSchemaVersionsTable(client);

      // Run migrations to bring database up to current version
      await this.runMigrations(client);

      this.logger.info("Database initialized successfully with migrations");
    } catch (error) {
      this.logger.error("Failed to initialize database", error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create schema_versions table to track migrations
   */
  private async createSchemaVersionsTable(client: PoolClient): Promise<void> {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_versions (
        version INTEGER PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        migration_name VARCHAR(255) NOT NULL,
        description TEXT,
        success BOOLEAN NOT NULL DEFAULT true,
        error_message TEXT
      )
    `);

    // Check if this is a fresh installation or existing database
    const versionCheck = await client.query(
      "SELECT version FROM schema_versions ORDER BY version DESC LIMIT 1"
    );

    if (versionCheck.rows.length === 0) {
      // This could be either a fresh install or an existing database without versioning
      // Check if the players table exists to determine which case we're in
      const tableCheck = await client.query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'players'
      `);

      if (tableCheck.rows.length > 0) {
        // Existing database without versioning - mark as version 1
        await client.query(`
          INSERT INTO schema_versions (version, migration_name, description)
          VALUES (1, 'baseline', 'Existing database baseline - original death tracking schema')
        `);
        this.logger.info(
          "Detected existing database - marked as baseline version 1"
        );
      }
      // If no players table exists, it's a fresh install and migrations will start from version 1
    }
  }

  /**
   * Run all pending migrations
   */
  private async runMigrations(client: PoolClient): Promise<void> {
    const currentVersion = await this.getCurrentSchemaVersion(client);
    this.logger.info(`Current database schema version: ${currentVersion}`);

    const migrations = this.getMigrations();

    for (const migration of migrations) {
      if (migration.version > currentVersion) {
        this.logger.info(
          `Running migration ${migration.version}: ${migration.name}`
        );

        try {
          await migration.up(client);

          // Record successful migration
          await client.query(
            `
            INSERT INTO schema_versions (version, migration_name, description, success)
            VALUES ($1, $2, $3, true)
          `,
            [migration.version, migration.name, migration.description]
          );

          this.logger.info(
            `Migration ${migration.version} completed successfully`
          );
        } catch (error) {
          // Record failed migration
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          await client.query(
            `
            INSERT INTO schema_versions (version, migration_name, description, success, error_message)
            VALUES ($1, $2, $3, false, $4)
          `,
            [
              migration.version,
              migration.name,
              migration.description,
              errorMessage,
            ]
          );

          this.logger.error(
            `Migration ${migration.version} failed: ${errorMessage}`
          );
          throw error;
        }
      }
    }

    const finalVersion = await this.getCurrentSchemaVersion(client);
    this.logger.info(`Database is now at schema version: ${finalVersion}`);
  }

  /**
   * Get current schema version
   */
  private async getCurrentSchemaVersion(client: PoolClient): Promise<number> {
    try {
      const result = await client.query(`
        SELECT version FROM schema_versions 
        WHERE success = true 
        ORDER BY version DESC 
        LIMIT 1
      `);

      return result.rows.length > 0 ? result.rows[0].version : 0;
    } catch (error) {
      // If schema_versions table doesn't exist yet, we're at version 0
      this.logger.debug(
        "Schema versions table not found, assuming version 0",
        error
      );
      return 0;
    }
  }

  /**
   * Define all database migrations
   */
  private getMigrations(): Migration[] {
    return [
      {
        version: 1,
        name: "initial_schema",
        description:
          "Create initial players and config tables for death tracking",
        up: async (client: PoolClient) => {
          // Players table
          await client.query(`
            CREATE TABLE IF NOT EXISTS players (
              username VARCHAR(255) PRIMARY KEY,
              total_deaths INTEGER NOT NULL DEFAULT 0,
              last_death_timestamp TIMESTAMPTZ,
              first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

          // Basic indices
          await client.query(`
            CREATE INDEX IF NOT EXISTS idx_players_total_deaths ON players (total_deaths DESC)
          `);
        },
      },
      {
        version: 2,
        name: "activity_tracking",
        description:
          "Add activity tracking with player_activities table and enhanced player schema",
        up: async (client: PoolClient) => {
          // Add last_seen_timestamp to players table if it doesn't exist
          try {
            await client.query(`
              ALTER TABLE players 
              ADD COLUMN IF NOT EXISTS last_seen_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
            `);
          } catch (error) {
            // PostgreSQL < 9.6 doesn't support IF NOT EXISTS for columns
            // Check if column exists first
            this.logger.debug(
              "IF NOT EXISTS not supported for columns, checking manually",
              error
            );

            const columnCheck = await client.query(`
              SELECT column_name FROM information_schema.columns 
              WHERE table_name = 'players' AND column_name = 'last_seen_timestamp'
            `);

            if (columnCheck.rows.length === 0) {
              await client.query(
                `ALTER TABLE players ADD COLUMN last_seen_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()`
              );
            }
          }

          // Create player_activities table
          await client.query(`
            CREATE TABLE IF NOT EXISTS player_activities (
              id SERIAL PRIMARY KEY,
              username VARCHAR(255) NOT NULL,
              activity_type VARCHAR(50) NOT NULL CHECK (activity_type IN ('JOIN', 'LEAVE', 'CHAT', 'ACHIEVEMENT', 'DEATH')),
              timestamp TIMESTAMPTZ NOT NULL,
              metadata JSONB,
              created_at TIMESTAMPTZ DEFAULT NOW(),
              
              -- Foreign key to existing players table
              CONSTRAINT fk_activity_player FOREIGN KEY (username) REFERENCES players(username) ON DELETE CASCADE
            )
          `);

          // Enhanced indices for players table
          await client.query(`
            CREATE INDEX IF NOT EXISTS idx_players_last_seen ON players (last_seen_timestamp DESC)
          `);

          // Player activities indices for performance
          await client.query(`
            CREATE INDEX IF NOT EXISTS idx_activities_username ON player_activities (username)
          `);

          await client.query(`
            CREATE INDEX IF NOT EXISTS idx_activities_type ON player_activities (activity_type)
          `);

          await client.query(`
            CREATE INDEX IF NOT EXISTS idx_activities_timestamp ON player_activities (timestamp DESC)
          `);

          await client.query(`
            CREATE INDEX IF NOT EXISTS idx_activities_username_timestamp ON player_activities (username, timestamp DESC)
          `);

          await client.query(`
            CREATE INDEX IF NOT EXISTS idx_activities_type_timestamp ON player_activities (activity_type, timestamp DESC)
          `);

          // GIN index for metadata queries
          await client.query(`
            CREATE INDEX IF NOT EXISTS idx_activities_metadata ON player_activities USING GIN (metadata)
          `);

          // Backfill last_seen_timestamp for existing players
          await client.query(`
            UPDATE players 
            SET last_seen_timestamp = COALESCE(last_death_timestamp, last_updated)
            WHERE last_seen_timestamp = last_updated
          `);
        },
      },
      {
        version: 3,
        name: "session_notifications",
        description:
          "Add session notification tracking with player_session_notifications and player_session_cooldowns tables",
        up: async (client: PoolClient) => {
          // Create player_session_notifications table
          await client.query(`
            CREATE TABLE IF NOT EXISTS player_session_notifications (
              username VARCHAR(255) PRIMARY KEY,
              is_online BOOLEAN NOT NULL DEFAULT false,
              last_join_timestamp TIMESTAMPTZ,
              last_leave_timestamp TIMESTAMPTZ,
              notification_message_id VARCHAR(255),
              delete_scheduled_at TIMESTAMPTZ,
              status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'scheduled_for_deletion', 'deleted', 'failed')),
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              
              -- Foreign key to existing players table  
              CONSTRAINT fk_session_player 
                FOREIGN KEY (username) 
                REFERENCES players(username) 
                ON DELETE CASCADE
            )
          `);

          // Create player_session_cooldowns table
          await client.query(`
            CREATE TABLE IF NOT EXISTS player_session_cooldowns (
              username VARCHAR(255) PRIMARY KEY,
              last_join_notification TIMESTAMPTZ,
              cooldown_expires_at TIMESTAMPTZ,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              
              -- Foreign key to existing players table
              CONSTRAINT fk_cooldown_player 
                FOREIGN KEY (username) 
                REFERENCES players(username) 
                ON DELETE CASCADE
            )
          `);

          // Indexes for performance
          await client.query(`
            CREATE INDEX IF NOT EXISTS idx_session_online ON player_session_notifications (is_online)
          `);

          await client.query(`
            CREATE INDEX IF NOT EXISTS idx_session_status ON player_session_notifications (status)
          `);

          await client.query(`
            CREATE INDEX IF NOT EXISTS idx_session_delete_scheduled ON player_session_notifications (delete_scheduled_at)
          `);

          await client.query(`
            CREATE INDEX IF NOT EXISTS idx_session_message ON player_session_notifications (notification_message_id)
          `);

          await client.query(`
            CREATE INDEX IF NOT EXISTS idx_cooldown_expires ON player_session_cooldowns (cooldown_expires_at)
          `);
        },
      },
    ];
  }

  /**
   * Get migration history
   */
  async getMigrationHistory(): Promise<SchemaVersion[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT version, applied_at, migration_name, description, success, error_message
        FROM schema_versions 
        ORDER BY version ASC
      `);

      return result.rows.map((row) => ({
        version: row.version,
        applied_at: row.applied_at,
        migration_name: row.migration_name,
        description: row.description,
        success: row.success,
        error_message: row.error_message,
      }));
    } catch (error) {
      this.logger.error("Failed to get migration history", error);
      return [];
    } finally {
      client.release();
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
   * Store player activity
   */
  async storeActivity(activity: NewPlayerActivity): Promise<void> {
    const client = await this.pool.connect();
    try {
      // First ensure player exists
      await client.query(
        `INSERT INTO players (username, first_seen, last_seen_timestamp)
         VALUES ($1, $2, $2)
         ON CONFLICT (username) 
         DO UPDATE SET last_seen_timestamp = EXCLUDED.last_seen_timestamp`,
        [activity.username, activity.timestamp]
      );

      // Store the activity
      const serializedMetadata = activity.metadata
        ? this.safeJsonStringify(activity.metadata)
        : null;
      await client.query(
        `INSERT INTO player_activities (username, activity_type, timestamp, metadata)
         VALUES ($1, $2, $3, $4)`,
        [
          activity.username,
          activity.activity_type,
          activity.timestamp,
          serializedMetadata,
        ]
      );

      this.logger.debug(
        `Activity stored: ${activity.username} - ${activity.activity_type}`
      );
    } catch (error) {
      this.logger.error("Failed to store activity", { error, activity });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get player activities
   */
  async getPlayerActivities(
    username: string,
    activityType?: ActivityType
  ): Promise<PlayerActivity[]> {
    const client = await this.pool.connect();
    try {
      let query = `
        SELECT id, username, activity_type, timestamp, metadata, created_at
        FROM player_activities 
        WHERE username = $1
      `;
      const params: any[] = [username];

      if (activityType) {
        query += ` AND activity_type = $2`;
        params.push(activityType);
      }

      query += ` ORDER BY timestamp DESC`;

      const result = await client.query(query, params);

      return result.rows.map((row) => ({
        id: row.id,
        username: row.username,
        activity_type: row.activity_type,
        timestamp: row.timestamp,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        created_at: row.created_at,
      }));
    } catch (error) {
      this.logger.error("Failed to get player activities", {
        error,
        username,
        activityType,
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Store death event
   */
  async storeDeath(death: DeathEvent): Promise<void> {
    const client = await this.pool.connect();
    try {
      // First ensure player exists
      await client.query(
        `INSERT INTO players (username, first_seen, last_seen_timestamp, total_deaths)
         VALUES ($1, $2, $2, 1)
         ON CONFLICT (username) 
         DO UPDATE SET 
           last_seen_timestamp = EXCLUDED.last_seen_timestamp, 
           total_deaths = players.total_deaths + 1`,
        [death.playerId, death.timestamp]
      );

      // Store death as activity
      const deathActivity: NewPlayerActivity = {
        username: death.playerId,
        activity_type: "DEATH",
        timestamp: death.timestamp,
        metadata: {
          cause: death.cause,
          experience_level: death.experienceLevel,
        },
      };

      await this.storeActivity(deathActivity);

      this.logger.debug(`Death stored: ${death.playerId} - ${death.cause}`);
    } catch (error) {
      this.logger.error("Failed to store death", { error, death });
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

  // Session notification methods

  /**
   * Record a session notification with Discord message reference
   */
  public async recordSessionNotification(
    data: SessionNotificationData
  ): Promise<NotificationRecord> {
    const client = await this.pool.connect();
    try {
      const expiresAt =
        data.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours default

      const result = await client.query(
        `
        INSERT INTO player_session_notifications 
        (username, is_online, notification_message_id, delete_scheduled_at, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        ON CONFLICT (username) 
        DO UPDATE SET 
          is_online = $2,
          notification_message_id = $3,
          delete_scheduled_at = $4,
          status = $5,
          updated_at = NOW()
        RETURNING username, is_online, notification_message_id, delete_scheduled_at, status, created_at, updated_at
        `,
        [
          data.username,
          data.type === "JOIN",
          data.discordMessageId,
          data.type === "JOIN" ? null : expiresAt,
          "active",
        ]
      );

      return {
        username: result.rows[0].username,
        type: data.type,
        discordMessageId: result.rows[0].notification_message_id,
        discordChannelId: data.discordChannelId,
        discordGuildId: data.discordGuildId,
        createdAt: result.rows[0].created_at,
        expiresAt: expiresAt,
        isDeleted: false,
      };
    } catch (error) {
      this.logger.error("Failed to record session notification", {
        error,
        data,
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Find active JOIN notification for LEAVE event deletion
   */
  public async findActiveJoinNotification(
    username: string,
    channelId: string
  ): Promise<NotificationRecord | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `
        SELECT username, is_online, notification_message_id, delete_scheduled_at, status, created_at, updated_at
        FROM player_session_notifications
        WHERE username = $1 AND is_online = true AND notification_message_id IS NOT NULL AND status = 'active'
        `,
        [username]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        username: row.username,
        type: "JOIN",
        discordMessageId: row.notification_message_id,
        discordChannelId: channelId,
        discordGuildId: "", // Will be filled by caller
        createdAt: row.created_at,
        expiresAt:
          row.delete_scheduled_at || new Date(Date.now() + 24 * 60 * 60 * 1000),
        isDeleted: false,
      };
    } catch (error) {
      this.logger.error("Failed to find active join notification", {
        error,
        username,
        channelId,
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Mark notification as deleted (set discord_message_id to null)
   */
  public async markNotificationDeleted(username: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `
        UPDATE player_session_notifications 
        SET notification_message_id = NULL, status = 'deleted', updated_at = NOW()
        WHERE username = $1
        `,
        [username]
      );

      return (result.rowCount || 0) > 0;
    } catch (error) {
      this.logger.error("Failed to mark notification deleted", {
        error,
        username,
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Schedule notification for deletion
   */
  public async scheduleNotificationDeletion(
    username: string,
    deleteAt: Date
  ): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `
        UPDATE player_session_notifications 
        SET delete_scheduled_at = $2, status = 'scheduled_for_deletion', is_online = false, updated_at = NOW()
        WHERE username = $1
        `,
        [username, deleteAt]
      );

      return (result.rowCount || 0) > 0;
    } catch (error) {
      this.logger.error("Failed to schedule notification deletion", {
        error,
        username,
        deleteAt,
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Remove expired notification records (automated cleanup)
   */
  public async cleanupExpiredNotifications(): Promise<number> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `
        DELETE FROM player_session_notifications 
        WHERE delete_scheduled_at IS NOT NULL AND delete_scheduled_at < NOW()
        `
      );

      this.logger.info(
        `Cleaned up ${result.rowCount || 0} expired session notifications`
      );
      return result.rowCount || 0;
    } catch (error) {
      this.logger.error("Failed to cleanup expired notifications", { error });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Check if player is in cooldown period
   */
  public async checkSessionCooldown(
    username: string,
    eventType: "JOIN" | "LEAVE"
  ): Promise<CooldownStatus> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `
        SELECT last_join_notification, cooldown_expires_at
        FROM player_session_cooldowns
        WHERE username = $1
        `,
        [username]
      );

      if (result.rows.length === 0) {
        return {
          inCooldown: false,
          remainingSeconds: 0,
          consecutiveEvents: 0,
          lastEventAt: null,
        };
      }

      const row = result.rows[0];
      const now = new Date();
      const cooldownExpires = row.cooldown_expires_at
        ? new Date(row.cooldown_expires_at)
        : null;

      const inCooldown = cooldownExpires && cooldownExpires > now;
      const remainingSeconds = inCooldown
        ? Math.ceil((cooldownExpires.getTime() - now.getTime()) / 1000)
        : 0;

      return {
        inCooldown: inCooldown || false,
        remainingSeconds,
        consecutiveEvents: 1, // Simplified for MVP
        lastEventAt: row.last_join_notification
          ? new Date(row.last_join_notification)
          : null,
      };
    } catch (error) {
      this.logger.error("Failed to check session cooldown", {
        error,
        username,
        eventType,
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update cooldown state after session event
   */
  public async updateSessionCooldown(
    username: string,
    eventType: "JOIN" | "LEAVE"
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      if (eventType === "JOIN") {
        const cooldownExpires = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes

        await client.query(
          `
          INSERT INTO player_session_cooldowns (username, last_join_notification, cooldown_expires_at, updated_at)
          VALUES ($1, NOW(), $2, NOW())
          ON CONFLICT (username)
          DO UPDATE SET 
            last_join_notification = NOW(),
            cooldown_expires_at = $2,
            updated_at = NOW()
          `,
          [username, cooldownExpires]
        );
      }
      // For LEAVE events, we don't update cooldown since it only applies to JOIN notifications
    } catch (error) {
      this.logger.error("Failed to update session cooldown", {
        error,
        username,
        eventType,
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get all active (non-deleted) session notifications
   */
  public async getActiveSessionNotifications(
    channelId?: string
  ): Promise<NotificationRecord[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `
        SELECT username, is_online, notification_message_id, delete_scheduled_at, status, created_at, updated_at
        FROM player_session_notifications
        WHERE notification_message_id IS NOT NULL AND status IN ('active', 'scheduled_for_deletion')
        ORDER BY created_at DESC
        `
      );

      return result.rows.map((row) => ({
        username: row.username,
        type: "JOIN" as const,
        discordMessageId: row.notification_message_id,
        discordChannelId: channelId || "",
        discordGuildId: "",
        createdAt: row.created_at,
        expiresAt:
          row.delete_scheduled_at || new Date(Date.now() + 24 * 60 * 60 * 1000),
        isDeleted: row.notification_message_id === null,
      }));
    } catch (error) {
      this.logger.error("Failed to get active session notifications", {
        error,
        channelId,
      });
      throw error;
    } finally {
      client.release();
    }
  }
}
