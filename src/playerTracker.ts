// T012: Player tracking service managing death counts and rate limiting
import { Player, DeathEvent, IStorageService, ActivityEvent } from "./types";
import { Logger } from "./logger";
import { SessionTracker } from "./sessionTracker";

export class PlayerTracker {
  private readonly storageService: IStorageService;
  private readonly sessionTracker: SessionTracker;
  private readonly logger = Logger.getInstance();
  private readonly RATE_LIMIT_SECONDS = 10;

  constructor(storageService: IStorageService) {
    this.storageService = storageService;
    this.sessionTracker = new SessionTracker(storageService);
  }

  async getPlayer(username: string): Promise<Player | null> {
    try {
      return await this.storageService.getPlayer(username);
    } catch (error) {
      this.logger.error(`Failed to get player data for ${username}`, error);
      return null;
    }
  }

  async createOrUpdatePlayer(username: string): Promise<Player> {
    try {
      // Use upsert to ensure player exists - this handles race conditions
      await this.storageService.updatePlayer(username, {});

      // Now get the player (guaranteed to exist)
      const player = await this.storageService.getPlayer(username);

      if (!player) {
        throw new Error(`Failed to create/retrieve player ${username}`);
      }

      return player;
    } catch (error) {
      this.logger.error(`Failed to create/update player ${username}`, error);
      throw error;
    }
  }

  async recordDeath(deathEvent: DeathEvent): Promise<{
    recorded: boolean;
    totalDeaths: number;
    previousDeathTimestamp?: string | null;
    lastLifeDurationMs?: number;
    timestampedEvent?: DeathEvent;
  }> {
    try {
      const username = deathEvent.username;
      const deathTimestamp = deathEvent.timestamp; // Use timestamp from log

      // Check for rate limiting using the death's timestamp
      const rateLimitResult = await this.checkRateLimit(
        username,
        deathTimestamp
      );
      if (rateLimitResult.isLimited) {
        this.logger.warn(
          `Death rate limited for ${username} (${rateLimitResult.remainingSeconds}s remaining)`
        );
        return { recorded: false, totalDeaths: 0, lastLifeDurationMs: 0 };
      }

      // The event already has the correct timestamp
      const timestampedEvent = deathEvent;

      // Get or create player
      let player = await this.storageService.getPlayer(username);
      player ??= await this.createOrUpdatePlayer(username);

      // Get previous death timestamp for announcement
      const recentDeaths = await this.storageService.getPlayerActivities(
        username,
        "DEATH"
      );
      const previousDeathTimestamp =
        recentDeaths.length > 0
          ? recentDeaths[0].timestamp.toISOString()
          : null;

      // Log the death activity
      const deathActivity: ActivityEvent = {
        username,
        eventType: "DEATH",
        timestamp: deathTimestamp,
        details: deathEvent.cause,
      };
      await this.storageService.logActivity(deathActivity);

      // Calculate and store the last life duration
      const lastLifeDuration =
        await this.sessionTracker.calculateLastLifeDuration(username);

      // Update player death count and last life duration
      const newTotalDeaths = player.totalDeaths + 1;
      await this.storageService.updatePlayer(username, {
        totalDeaths: newTotalDeaths,
        lastLifeDurationMs: lastLifeDuration,
      });

      this.logger.info(
        `Recorded death for ${username} (Total: ${newTotalDeaths}, Last life: ${this.sessionTracker.formatLastLifeDuration(
          lastLifeDuration
        )})`
      );

      // Handle PvP kill reward: subtract 1 death from killer
      if (deathEvent.killerUsername) {
        try {
          await this.storageService.subtractPlayerDeath(
            deathEvent.killerUsername
          );
          this.logger.info(
            `🗡️ PvP kill reward: Subtracted 1 death from ${deathEvent.killerUsername} for killing ${username}`
          );
        } catch (killerError) {
          this.logger.error(
            `Failed to subtract death from killer ${deathEvent.killerUsername}`,
            killerError
          );
          // Don't fail the whole operation if killer reward fails
        }
      }

      return {
        recorded: true,
        totalDeaths: newTotalDeaths,
        previousDeathTimestamp,
        lastLifeDurationMs: lastLifeDuration,
        timestampedEvent,
      };
    } catch (error) {
      this.logger.error(
        `Failed to record death for ${deathEvent.username}`,
        error
      );
      return { recorded: false, totalDeaths: 0, lastLifeDurationMs: 0 };
    }
  }

  async recordJoin(username: string, timestamp: Date): Promise<void> {
    try {
      // Check for recent join events to prevent duplicates
      this.logger.info(`🔍 Checking for recent JOIN events for ${username}...`);
      const recentJoin = await this.storageService.getRecentActivity(
        username,
        "JOIN",
        30
      ); // 30 seconds
      if (recentJoin) {
        const secondsAgo = Math.round(
          (timestamp.getTime() - recentJoin.timestamp.getTime()) / 1000
        );
        this.logger.info(
          `🔴 SKIPPING duplicate join for ${username} - last join was ${secondsAgo}s ago at ${recentJoin.timestamp.toISOString()}`
        );
        return;
      }

      this.logger.info(
        `✅ No recent JOIN found for ${username}, proceeding to record...`
      );

      // Ensure player exists
      await this.createOrUpdatePlayer(username);

      // Log join activity
      const joinActivity: ActivityEvent = {
        username,
        eventType: "JOIN",
        timestamp,
      };
      await this.storageService.logActivity(joinActivity);

      // Update player join timestamp
      await this.storageService.updatePlayer(username, {
        lastJoin: timestamp,
      });

      // Note: Online time will be updated when player leaves and session is complete

      this.logger.info(`Recorded join for ${username}`);
    } catch (error) {
      this.logger.error(`Failed to record join for ${username}`, error);
    }
  }

  async recordLeave(username: string, timestamp: Date): Promise<void> {
    try {
      // Check for recent leave events to prevent duplicates
      this.logger.info(
        `🔍 Checking for recent LEAVE events for ${username}...`
      );
      const recentLeave = await this.storageService.getRecentActivity(
        username,
        "LEAVE",
        30
      ); // 30 seconds
      if (recentLeave) {
        const secondsAgo = Math.round(
          (timestamp.getTime() - recentLeave.timestamp.getTime()) / 1000
        );
        this.logger.info(
          `🔴 SKIPPING duplicate leave for ${username} - last leave was ${secondsAgo}s ago at ${recentLeave.timestamp.toISOString()}`
        );
        return;
      }

      this.logger.info(
        `✅ No recent LEAVE found for ${username}, proceeding to record...`
      );

      // Ensure player exists
      await this.createOrUpdatePlayer(username);

      // Log leave activity
      const leaveActivity: ActivityEvent = {
        username,
        eventType: "LEAVE",
        timestamp,
      };
      await this.storageService.logActivity(leaveActivity);

      // Update player leave timestamp
      await this.storageService.updatePlayer(username, {
        lastLeave: timestamp,
      });

      // Update online time after leave (calculate total sessions)
      await this.sessionTracker.updatePlayerOnlineTime(username);

      this.logger.info(`Recorded leave for ${username}`);
    } catch (error) {
      this.logger.error(`Failed to record leave for ${username}`, error);
    }
  }

  async recordAchievement(
    username: string,
    achievementName: string
  ): Promise<void> {
    try {
      const now = new Date();

      // Log achievement activity
      const achievementActivity: ActivityEvent = {
        username,
        eventType: "ACHIEVEMENT",
        timestamp: now,
        details: achievementName,
      };
      await this.storageService.logActivity(achievementActivity);

      this.logger.debug(
        `Recorded achievement for ${username}: ${achievementName}`
      );
    } catch (error) {
      this.logger.error(`Failed to record achievement for ${username}`, error);
    }
  }

  private async checkRateLimit(
    username: string,
    currentTimestamp?: Date
  ): Promise<{
    isLimited: boolean;
    remainingSeconds: number;
  }> {
    try {
      const recentDeaths = await this.storageService.getPlayerActivities(
        username,
        "DEATH"
      );

      if (recentDeaths.length === 0) {
        return { isLimited: false, remainingSeconds: 0 }; // No previous deaths, not rate limited
      }

      const lastDeath = recentDeaths[0];
      const currentTime = currentTimestamp
        ? currentTimestamp.getTime()
        : Date.now();
      const timeSinceLastDeath = currentTime - lastDeath.timestamp.getTime();
      const rateLimitMs = this.RATE_LIMIT_SECONDS * 1000;

      if (timeSinceLastDeath < rateLimitMs) {
        const remainingMs = rateLimitMs - timeSinceLastDeath;
        const remainingSeconds = Math.ceil(remainingMs / 1000);
        return { isLimited: true, remainingSeconds };
      }

      return { isLimited: false, remainingSeconds: 0 };
    } catch (error) {
      this.logger.error(`Failed to check rate limit for ${username}`, error);
      return { isLimited: false, remainingSeconds: 0 }; // Don't rate limit on error
    }
  }

  async getAllPlayers(): Promise<Player[]> {
    try {
      return await this.storageService.getAllPlayers();
    } catch (error) {
      this.logger.error("Failed to get all players", error);
      return [];
    }
  }

  async getTopDeathCounts(
    limit: number = 10
  ): Promise<Array<{ username: string; deaths: number }>> {
    try {
      const players = await this.getAllPlayers();

      return players
        .map((player) => ({
          username: player.username,
          deaths: player.totalDeaths,
        }))
        .filter((p) => p.deaths > 0)
        .sort((a, b) => b.deaths - a.deaths)
        .slice(0, limit);
    } catch (error) {
      this.logger.error("Failed to get top death counts", error);
      return [];
    }
  }

  async getPlayerStats(username: string): Promise<{
    totalDeaths: number;
    daysSinceFirstSeen: number;
    isActive: boolean;
    recentActivity: ActivityEvent[];
  } | null> {
    try {
      const player = await this.getPlayer(username);
      if (!player) {
        return null;
      }

      // Get recent activity (last 10 events)
      const recentActivity = await this.storageService.getPlayerActivities(
        username
      );

      return {
        totalDeaths: player.totalDeaths,
        daysSinceFirstSeen: Math.floor(
          (Date.now() - player.createdAt.getTime()) / (1000 * 60 * 60 * 24)
        ),
        isActive: this.isPlayerActive(player),
        recentActivity: recentActivity.slice(0, 10),
      };
    } catch (error) {
      this.logger.error(`Failed to get player stats for ${username}`, error);
      return null;
    }
  }

  private isPlayerActive(player: Player): boolean {
    // Consider active if they've joined in the last 7 days
    if (!player.lastJoin) {
      return false;
    }

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return player.lastJoin.getTime() > sevenDaysAgo;
  }

  /**
   * Update online time for all players (useful on bot startup)
   */
  async updateAllPlayersOnlineTime(): Promise<void> {
    try {
      await this.sessionTracker.updateAllPlayersOnlineTime();
      this.logger.info("Updated online time for all players");
    } catch (error) {
      this.logger.error("Failed to update online time for all players", error);
    }
  }
}
