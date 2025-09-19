// T012: Player tracking service managing death counts and rate limiting
import { Player, DeathEvent, IStorageService, ActivityEvent } from "./types";
import { Logger } from "./logger";

export class PlayerTracker {
  private readonly storageService: IStorageService;
  private readonly logger = Logger.getInstance();
  private readonly RATE_LIMIT_SECONDS = 10;

  constructor(storageService: IStorageService) {
    this.storageService = storageService;
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
      let player = await this.storageService.getPlayer(username);

      if (!player) {
        // Create new player
        const now = new Date();
        player = {
          username,
          totalDeaths: 0,
          lastJoin: null,
          lastLeave: null,
          createdAt: now,
        };

        await this.storageService.updatePlayer(username, player);
        this.logger.info(`Created new player record for ${username}`);
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
  }> {
    try {
      const username = deathEvent.username;

      // Check for rate limiting using the new death's timestamp
      const rateLimitResult = await this.checkRateLimit(
        username,
        deathEvent.timestamp
      );
      if (rateLimitResult.isLimited) {
        this.logger.warn(
          `Death rate limited for ${username} (${rateLimitResult.remainingSeconds}s remaining)`
        );
        return { recorded: false, totalDeaths: 0 };
      }

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
        timestamp: deathEvent.timestamp,
        details: deathEvent.cause,
      };
      await this.storageService.logActivity(deathActivity);

      // Update player death count
      const newTotalDeaths = player.totalDeaths + 1;
      await this.storageService.updatePlayer(username, {
        totalDeaths: newTotalDeaths,
      });

      this.logger.info(
        `Recorded death for ${username} (Total: ${newTotalDeaths})`
      );

      return {
        recorded: true,
        totalDeaths: newTotalDeaths,
        previousDeathTimestamp,
      };
    } catch (error) {
      this.logger.error(
        `Failed to record death for ${deathEvent.username}`,
        error
      );
      return { recorded: false, totalDeaths: 0 };
    }
  }

  async recordJoin(username: string): Promise<void> {
    try {
      const now = new Date();

      // Ensure player exists
      await this.createOrUpdatePlayer(username);

      // Log join activity
      const joinActivity: ActivityEvent = {
        username,
        eventType: "JOIN",
        timestamp: now,
      };
      await this.storageService.logActivity(joinActivity);

      // Update player join timestamp
      await this.storageService.updatePlayer(username, {
        lastJoin: now,
      });

      this.logger.info(`Recorded join for ${username}`);
    } catch (error) {
      this.logger.error(`Failed to record join for ${username}`, error);
    }
  }

  async recordLeave(username: string): Promise<void> {
    try {
      const now = new Date();

      // Ensure player exists
      await this.createOrUpdatePlayer(username);

      // Log leave activity
      const leaveActivity: ActivityEvent = {
        username,
        eventType: "LEAVE",
        timestamp: now,
      };
      await this.storageService.logActivity(leaveActivity);

      // Update player leave timestamp
      await this.storageService.updatePlayer(username, {
        lastLeave: now,
      });

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
}
