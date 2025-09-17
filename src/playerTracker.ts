// T012: Player tracking service managing death counts and rate limiting
import { Player, DeathEvent } from "./types";
import { StorageService } from "./storage";
import { Logger } from "./logger";

export class PlayerTracker {
  private readonly storageService: StorageService;
  private readonly logger = Logger.getInstance();
  private readonly RATE_LIMIT_SECONDS = 30;

  constructor(storageService: StorageService) {
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
          lastDeathTimestamp: null,
          firstSeen: now,
          lastUpdated: now,
          lastSeenTimestamp: now,
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
    reason?: string;
    totalDeaths?: number;
    previousDeathTimestamp?: Date;
  }> {
    const username = deathEvent.playerId;

    try {
      // Get or create player
      const player = await this.createOrUpdatePlayer(username);

      // Store previous death timestamp before rate limiting check
      const previousDeathTimestamp = player.lastDeathTimestamp;

      // Check rate limiting
      if (this.isRateLimited(player, deathEvent.timestamp)) {
        const timeSinceLastDeath =
          deathEvent.timestamp.getTime() -
          (player.lastDeathTimestamp?.getTime() || 0);
        const remainingCooldown = Math.ceil(
          (this.RATE_LIMIT_SECONDS * 1000 - timeSinceLastDeath) / 1000
        );

        this.logger.info(
          `Death for ${username} rate limited - ${remainingCooldown}s remaining`
        );
        return {
          recorded: false,
          reason: `Rate limited - ${remainingCooldown} seconds remaining`,
        };
      }

      // Record the death
      const newTotalDeaths = player.totalDeaths + 1;

      await this.storageService.updatePlayer(username, {
        totalDeaths: newTotalDeaths,
        lastDeathTimestamp: deathEvent.timestamp,
        lastUpdated: new Date(),
        lastSeenTimestamp: deathEvent.timestamp, // Update activity tracking
      });

      this.logger.info(
        `Recorded death #${newTotalDeaths} for ${username}: ${deathEvent.cause}`
      );

      return {
        recorded: true,
        totalDeaths: newTotalDeaths,
        previousDeathTimestamp: previousDeathTimestamp || undefined,
      };
    } catch (error) {
      this.logger.error(`Failed to record death for ${username}`, error);
      return {
        recorded: false,
        reason: "Storage error occurred",
      };
    }
  }

  private isRateLimited(player: Player, currentDeathTime: Date): boolean {
    if (!player.lastDeathTimestamp) {
      return false; // No previous death, no rate limit
    }

    const timeSinceLastDeath =
      currentDeathTime.getTime() - player.lastDeathTimestamp.getTime();
    const rateLimitMs = this.RATE_LIMIT_SECONDS * 1000;

    return timeSinceLastDeath < rateLimitMs;
  }

  async getPlayerStats(username: string): Promise<{
    exists: boolean;
    totalDeaths: number;
    lastDeath: Date | null;
    firstSeen: Date | null;
    daysSinceFirstSeen: number;
  }> {
    try {
      const player = await this.storageService.getPlayer(username);

      if (!player) {
        return {
          exists: false,
          totalDeaths: 0,
          lastDeath: null,
          firstSeen: null,
          daysSinceFirstSeen: 0,
        };
      }

      const daysSinceFirstSeen = Math.floor(
        (Date.now() - player.firstSeen.getTime()) / (1000 * 60 * 60 * 24)
      );

      return {
        exists: true,
        totalDeaths: player.totalDeaths,
        lastDeath: player.lastDeathTimestamp,
        firstSeen: player.firstSeen,
        daysSinceFirstSeen,
      };
    } catch (error) {
      this.logger.error(`Failed to get stats for ${username}`, error);
      return {
        exists: false,
        totalDeaths: 0,
        lastDeath: null,
        firstSeen: null,
        daysSinceFirstSeen: 0,
      };
    }
  }

  async getAllPlayers(): Promise<Player[]> {
    try {
      const data = await this.storageService.loadPlayers();
      return Object.values(data.players);
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

  async cleanupOldPlayers(daysInactive: number = 90): Promise<number> {
    try {
      const data = await this.storageService.loadPlayers();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysInactive);

      let removedCount = 0;
      const playersToKeep: Record<string, Player> = {};

      for (const [username, player] of Object.entries(data.players)) {
        if (player.lastUpdated > cutoffDate) {
          playersToKeep[username] = player;
        } else {
          removedCount++;
          this.logger.debug(`Removing inactive player: ${username}`);
        }
      }

      if (removedCount > 0) {
        data.players = playersToKeep;
        await this.storageService.savePlayers(data);
        this.logger.info(`Cleaned up ${removedCount} inactive players`);
      }

      return removedCount;
    } catch (error) {
      this.logger.error("Failed to cleanup old players", error);
      return 0;
    }
  }

  // Method to get time until rate limit expires for a player
  async getTimeUntilRateLimitExpires(username: string): Promise<number> {
    try {
      const player = await this.storageService.getPlayer(username);

      if (!player?.lastDeathTimestamp) {
        return 0; // No rate limit
      }

      const timeSinceLastDeath =
        Date.now() - player.lastDeathTimestamp.getTime();
      const rateLimitMs = this.RATE_LIMIT_SECONDS * 1000;

      if (timeSinceLastDeath >= rateLimitMs) {
        return 0; // Rate limit expired
      }

      return Math.ceil((rateLimitMs - timeSinceLastDeath) / 1000);
    } catch (error) {
      this.logger.error(`Failed to get rate limit info for ${username}`, error);
      return 0;
    }
  }
}
