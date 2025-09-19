// LeaderboardService - Daily death leaderboard generation
import {
  DailyLeaderboard,
  LeaderboardEntry,
  SurvivalChampion,
  Player,
  IStorageService,
  ConfigData,
} from "./types";
import { Logger } from "./logger";
import { SessionTracker } from "./sessionTracker";

export class LeaderboardService {
  private readonly storageService: IStorageService;
  private readonly sessionTracker: SessionTracker;
  private readonly logger = Logger.getInstance();

  constructor(storageService: IStorageService) {
    this.storageService = storageService;
    this.sessionTracker = new SessionTracker(storageService);
  }

  /**
   * Generate current leaderboard based on all tracked players
   */
  async generateLeaderboard(): Promise<DailyLeaderboard> {
    try {
      const players = await this.storageService.getAllPlayers();

      // Generate leaderboard entries sorted by death count (ascending), then alphabetically
      const leaderboard = this.generateLeaderboardEntries(players);

      // Get survival champion from active players only
      const activePlayers = this.getActivePlayers(players);
      const survivalChampion = await this.getSurvivalChampion(activePlayers);

      const result: DailyLeaderboard = {
        generatedAt: new Date(),
        leaderboard,
        survivalChampion,
        totalPlayers: leaderboard.length,
      };

      this.logger.info(`Generated leaderboard: ${result.totalPlayers} players`);

      return result;
    } catch (error) {
      this.logger.error("Failed to generate leaderboard", error);
      throw new Error("Failed to generate leaderboard");
    }
  }

  /**
   * Generate daily leaderboard based on deaths from the last 24 hours
   */
  async generateDailyLeaderboard(): Promise<DailyLeaderboard> {
    try {
      const players = await this.storageService.getAllPlayers();

      // Get today's deaths for each player
      const dailyEntries: LeaderboardEntry[] = [];

      for (const player of players) {
        const deathsToday = await this.storageService.getDeathsToday();
        const playerDeathsToday = deathsToday.filter(
          (death) => death.username === player.username
        ).length;

        const isActive = this.isPlayerActive(player);

        dailyEntries.push({
          rank: 0, // Will be set after sorting
          username: player.username,
          totalDeaths: playerDeathsToday,
          isActive,
        });
      }

      // Sort by deaths (descending), then alphabetically for ties
      dailyEntries.sort((a, b) => {
        if (a.totalDeaths !== b.totalDeaths) {
          return b.totalDeaths - a.totalDeaths; // Higher deaths first
        }
        return a.username.localeCompare(b.username);
      });

      // Assign ranks
      let currentRank = 1;
      for (let i = 0; i < dailyEntries.length; i++) {
        if (
          i > 0 &&
          dailyEntries[i].totalDeaths < dailyEntries[i - 1].totalDeaths
        ) {
          currentRank = i + 1;
        }
        dailyEntries[i].rank = currentRank;
      }

      // Get survival champion from active players
      const activePlayers = this.getActivePlayers(players);
      const survivalChampion = await this.getSurvivalChampion(activePlayers);

      const result: DailyLeaderboard = {
        generatedAt: new Date(),
        leaderboard: dailyEntries,
        survivalChampion,
        totalPlayers: dailyEntries.length,
      };

      this.logger.info(
        `Generated daily leaderboard: ${result.totalPlayers} players`
      );

      return result;
    } catch (error) {
      this.logger.error("Failed to generate daily leaderboard", error);
      throw new Error("Failed to generate daily leaderboard");
    }
  }

  /**
   * Generate leaderboard entries from players array
   */
  private generateLeaderboardEntries(players: Player[]): LeaderboardEntry[] {
    const entries = players
      .map((player) => ({
        rank: 0, // Will be set after sorting
        username: player.username,
        totalDeaths: player.totalDeaths,
        isActive: this.isPlayerActive(player),
      }))
      .sort((a, b) => {
        // Sort by deaths ascending (fewer deaths = better rank)
        if (a.totalDeaths !== b.totalDeaths) {
          return a.totalDeaths - b.totalDeaths;
        }
        // Alphabetical for ties
        return a.username.localeCompare(b.username);
      });

    // Assign ranks
    let currentRank = 1;
    for (let i = 0; i < entries.length; i++) {
      if (i > 0 && entries[i].totalDeaths > entries[i - 1].totalDeaths) {
        currentRank = i + 1;
      }
      entries[i].rank = currentRank;
    }

    return entries;
  }

  /**
   * Get survival champion (longest online time without death among active players)
   */
  private async getSurvivalChampion(
    activePlayers: Player[]
  ): Promise<SurvivalChampion | null> {
    if (activePlayers.length === 0) {
      return null;
    }

    let champion: Player | null = null;
    let longestSurvival = 0;
    let championLastDeathTimestamp: string | null = null;

    for (const player of activePlayers) {
      try {
        // Get the last death time from activity log
        const deathEvents = await this.storageService.getPlayerActivities(
          player.username,
          "DEATH"
        );

        let onlineTimeSinceLastDeath: number;
        let playerLastDeathTimestamp: string | null;

        if (deathEvents.length === 0) {
          // No deaths recorded, use total online time
          onlineTimeSinceLastDeath = player.onlineTimeMs;
          playerLastDeathTimestamp = null;
          this.logger.info(
            `${player.username}: No deaths, total online time: ${onlineTimeSinceLastDeath}ms`
          );
        } else {
          // Online time since last death
          const lastDeath = deathEvents[0]; // Most recent death
          onlineTimeSinceLastDeath =
            await this.sessionTracker.calculateOnlineTimeSince(
              player.username,
              lastDeath.timestamp
            );
          playerLastDeathTimestamp = lastDeath.timestamp.toISOString();
          this.logger.info(
            `${player.username}: ${deathEvents.length} deaths, online time since last death: ${onlineTimeSinceLastDeath}ms`
          );
        }

        if (onlineTimeSinceLastDeath > longestSurvival) {
          longestSurvival = onlineTimeSinceLastDeath;
          champion = player;
          championLastDeathTimestamp = playerLastDeathTimestamp;
          this.logger.info(
            `New survival champion: ${player.username} with ${onlineTimeSinceLastDeath}ms`
          );
        } else {
          this.logger.info(
            `${player.username} not champion: ${onlineTimeSinceLastDeath}ms < current best ${longestSurvival}ms`
          );
        }
      } catch (error) {
        this.logger.warn(
          `Failed to get survival time for ${player.username}`,
          error
        );
      }
    }

    if (!champion) {
      return null;
    }

    return {
      username: champion.username,
      timeAliveMs: longestSurvival,
      lastDeathTimestamp: championLastDeathTimestamp,
      formattedTimeAlive: this.sessionTracker.formatOnlineTime(longestSurvival),
    };
  }

  /**
   * Format time alive into human-readable string
   */
  private formatTimeAlive(timeMs: number): string {
    const days = Math.floor(timeMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor(
      (timeMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
    );
    const minutes = Math.floor((timeMs % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }

  /**
   * Check if player is active (joined within last 7 days)
   */
  private isPlayerActive(player: Player): boolean {
    if (!player.lastJoin) {
      return false; // Never joined
    }

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return player.lastJoin.getTime() > sevenDaysAgo;
  }

  /**
   * Filter to active players (joined within last 7 days)
   */
  private getActivePlayers(players: Player[]): Player[] {
    return players.filter((player) => this.isPlayerActive(player));
  }

  /**
   * Get death streak for a player (consecutive deaths without survival milestones)
   */
  async getDeathStreak(username: string): Promise<number> {
    try {
      const activities = await this.storageService.getPlayerActivities(
        username
      );
      let streak = 0;

      // Count consecutive death events
      for (const activity of activities) {
        if (activity.eventType === "DEATH") {
          streak++;
        } else if (activity.eventType === "ACHIEVEMENT") {
          // Some achievements might break death streaks
          break;
        }
      }

      return streak;
    } catch (error) {
      this.logger.error(`Failed to get death streak for ${username}`, error);
      return 0;
    }
  }

  /**
   * Get the most dangerous time of day based on death patterns
   */
  async getMostDangerousTimeOfDay(): Promise<{
    hour: number;
    deaths: number;
  } | null> {
    try {
      const players = await this.storageService.getAllPlayers();
      const hourCounts = new Array(24).fill(0);

      for (const player of players) {
        const deathEvents = await this.storageService.getPlayerActivities(
          player.username,
          "DEATH"
        );

        for (const death of deathEvents) {
          const hour = death.timestamp.getHours();
          hourCounts[hour]++;
        }
      }

      let maxDeaths = 0;
      let dangerousHour = 0;

      for (let hour = 0; hour < 24; hour++) {
        if (hourCounts[hour] > maxDeaths) {
          maxDeaths = hourCounts[hour];
          dangerousHour = hour;
        }
      }

      return maxDeaths > 0 ? { hour: dangerousHour, deaths: maxDeaths } : null;
    } catch (error) {
      this.logger.error("Failed to get most dangerous time of day", error);
      return null;
    }
  }

  /**
   * Get top causes of death
   */
  async getTopCausesOfDeath(
    limit: number = 5
  ): Promise<Array<{ cause: string; count: number }>> {
    try {
      const players = await this.storageService.getAllPlayers();
      const causeCounts = new Map<string, number>();

      for (const player of players) {
        const deathEvents = await this.storageService.getPlayerActivities(
          player.username,
          "DEATH"
        );

        for (const death of deathEvents) {
          if (death.details) {
            const count = causeCounts.get(death.details) || 0;
            causeCounts.set(death.details, count + 1);
          }
        }
      }

      return Array.from(causeCounts.entries())
        .map(([cause, count]) => ({ cause, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
    } catch (error) {
      this.logger.error("Failed to get top causes of death", error);
      return [];
    }
  }

  /**
   * Check if leaderboard should be announced today (not already announced)
   */
  async shouldAnnounceToday(): Promise<boolean> {
    try {
      const config = await this.storageService.loadConfig();
      if (!config?.leaderboard) {
        return true; // No config means never announced
      }

      const lastAnnouncement = config.leaderboard.lastAnnouncementDate;
      if (!lastAnnouncement) {
        return true; // Never announced
      }

      const today = new Date().toDateString();
      const lastAnnouncementDate = new Date(lastAnnouncement).toDateString();

      return today !== lastAnnouncementDate; // Only announce once per day
    } catch (error) {
      this.logger.error("Failed to check announcement status", error);
      return true; // Default to allowing announcement on error
    }
  }

  /**
   * Mark that the daily announcement has been completed
   */
  async markAnnouncementComplete(): Promise<void> {
    try {
      const config = await this.storageService.loadConfig();
      const updatedConfig: ConfigData = {
        discord: config?.discord || {
          channelId: "",
          guildId: "",
          enabled: true,
        },
        logState: config?.logState,
        leaderboard: {
          enabled: true,
          lastAnnouncementDate: new Date().toISOString(),
          timezone: "EST",
          announcementTime: "23:59",
        },
      };

      await this.storageService.saveConfig(updatedConfig);
      this.logger.info("Marked daily leaderboard announcement as complete");
    } catch (error) {
      this.logger.error("Failed to mark announcement complete", error);
    }
  }

  /**
   * Reset announcement flag (for testing or manual reset)
   */
  async resetAnnouncementFlag(): Promise<void> {
    try {
      const config = await this.storageService.loadConfig();
      const updatedConfig: ConfigData = {
        discord: config?.discord || {
          channelId: "",
          guildId: "",
          enabled: true,
        },
        logState: config?.logState,
        leaderboard: {
          enabled: true,
          lastAnnouncementDate: "",
          timezone: "EST",
          announcementTime: "23:59",
        },
      };

      await this.storageService.saveConfig(updatedConfig);
      this.logger.info("Reset daily leaderboard announcement flag");
    } catch (error) {
      this.logger.error("Failed to reset announcement flag", error);
    }
  }

  /**
   * Update online time for all players (useful for fixing 0ms issues)
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
