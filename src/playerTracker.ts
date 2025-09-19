// Enhanced Player tracking service managing all activity types and comprehensive statistics
import {
  Player,
  DeathEvent,
  IStorageService,
  ActivityType,
  NewPlayerActivity,
  PlayerActivity,
} from "./types";
import { Logger } from "./logger";
import { RateLimiter } from "./rateLimiter";

export interface PlayerActivityStats {
  totalActivities: number;
  activityBreakdown: Record<ActivityType, number>;
  recentActivities: PlayerActivity[];
  sessionCount: number;
  averageSessionDuration: number; // in minutes
  lastActivity: PlayerActivity | null;
}

export interface EnhancedPlayerStats {
  // Basic info
  exists: boolean;
  username: string;
  firstSeen: string | null;
  lastSeen: string | null;
  daysSinceFirstSeen: number;
  isActive: boolean; // Active within last 7 days

  // Death-specific stats (backward compatibility)
  totalDeaths: number;
  lastDeath: string | null;

  // Enhanced activity stats
  activityStats: PlayerActivityStats;

  // Rate limiting info
  rateLimitInfo: {
    isRateLimited: boolean;
    limitedActivities: Array<{
      activityType: ActivityType;
      remainingSeconds: number;
    }>;
  };
}

export class PlayerTracker {
  private readonly storageService: IStorageService;
  private readonly logger = Logger.getInstance();
  private readonly rateLimiter: RateLimiter;

  constructor(storageService: IStorageService, rateLimiter?: RateLimiter) {
    this.storageService = storageService;
    this.rateLimiter =
      rateLimiter ||
      new RateLimiter({
        defaultRateLimitSeconds: 30,
        activitySpecificLimits: {
          DEATH: 30,
          JOIN: 5,
          LEAVE: 5,
          CHAT: 1,
          ACHIEVEMENT: 2,
        },
      });
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
        const now = new Date().toISOString();
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

  /**
   * Record any player activity with rate limiting
   */
  async recordActivity(activity: NewPlayerActivity): Promise<{
    recorded: boolean;
    reason?: string;
    activityCount?: number;
  }> {
    const username = activity.username;

    try {
      // Check rate limiting first
      if (
        this.rateLimiter.isActivityRateLimited(username, activity.activity_type)
      ) {
        const remainingSeconds = this.rateLimiter.getActivityTimeUntilExpiry(
          username,
          activity.activity_type
        );

        this.logger.info(
          `${activity.activity_type} for ${username} rate limited - ${remainingSeconds}s remaining`
        );

        return {
          recorded: false,
          reason: `Rate limited - ${remainingSeconds} seconds remaining`,
        };
      }

      // Ensure player exists
      await this.createOrUpdatePlayer(username);

      // Store the activity
      await this.storageService.storeActivity(activity);

      // Record rate limiting event
      this.rateLimiter.recordActivityEvent(
        username,
        activity.activity_type,
        activity.timestamp
      );

      // Update player's last seen timestamp
      await this.storageService.updatePlayer(username, {
        lastUpdated: new Date().toISOString(),
        lastSeenTimestamp: activity.timestamp.toISOString(),
      });

      // Get activity count for this type
      const activities = await this.storageService.getPlayerActivities(
        username,
        activity.activity_type
      );

      this.logger.info(
        `Recorded ${activity.activity_type} for ${username} (total ${activity.activity_type}: ${activities.length})`
      );

      return {
        recorded: true,
        activityCount: activities.length,
      };
    } catch (error) {
      this.logger.error(
        `Failed to record ${activity.activity_type} for ${username}`,
        error
      );
      return {
        recorded: false,
        reason: "Storage error occurred",
      };
    }
  }

  /**
   * Legacy method for death recording (backward compatibility)
   */
  async recordDeath(deathEvent: DeathEvent): Promise<{
    recorded: boolean;
    reason?: string;
    totalDeaths?: number;
    previousDeathTimestamp?: string;
  }> {
    const username = deathEvent.playerId;

    try {
      // Get player for previous death info
      const player = await this.getPlayer(username);
      const previousDeathTimestamp = player?.lastDeathTimestamp;

      // Convert death to activity
      const deathActivity: NewPlayerActivity = {
        username,
        activity_type: "DEATH",
        timestamp: deathEvent.timestamp,
        metadata: {
          cause: deathEvent.cause,
          experience_level: deathEvent.experienceLevel,
        },
      };

      const result = await this.recordActivity(deathActivity);

      if (!result.recorded) {
        return {
          recorded: false,
          reason: result.reason,
        };
      }

      // Update death-specific player data
      const newTotalDeaths = (player?.totalDeaths || 0) + 1;
      await this.storageService.updatePlayer(username, {
        totalDeaths: newTotalDeaths,
        lastDeathTimestamp: deathEvent.timestamp.toISOString(),
      });

      // Note: Death is already stored as activity via recordActivity() above
      // No need to call storageService.storeDeath() which would duplicate logging

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

  /**
   * Get comprehensive player statistics
   */
  async getEnhancedPlayerStats(username: string): Promise<EnhancedPlayerStats> {
    try {
      const player = await this.storageService.getPlayer(username);

      if (!player) {
        return {
          exists: false,
          username,
          firstSeen: null,
          lastSeen: null,
          daysSinceFirstSeen: 0,
          isActive: false,
          totalDeaths: 0,
          lastDeath: null,
          activityStats: {
            totalActivities: 0,
            activityBreakdown: {
              JOIN: 0,
              LEAVE: 0,
              CHAT: 0,
              ACHIEVEMENT: 0,
              DEATH: 0,
            },
            recentActivities: [],
            sessionCount: 0,
            averageSessionDuration: 0,
            lastActivity: null,
          },
          rateLimitInfo: {
            isRateLimited: false,
            limitedActivities: [],
          },
        };
      }

      // Calculate basic stats
      const daysSinceFirstSeen = Math.floor(
        (Date.now() - new Date(player.firstSeen).getTime()) /
          (1000 * 60 * 60 * 24)
      );

      const lastSeenDate = new Date(player.lastSeenTimestamp);
      const isActive =
        Date.now() - lastSeenDate.getTime() < 7 * 24 * 60 * 60 * 1000; // Active within 7 days

      // Get all player activities
      const allActivities = await this.storageService.getPlayerActivities(
        username
      );

      // Calculate activity breakdown
      const activityBreakdown: Record<ActivityType, number> = {
        JOIN: 0,
        LEAVE: 0,
        CHAT: 0,
        ACHIEVEMENT: 0,
        DEATH: 0,
      };

      allActivities.forEach((activity) => {
        activityBreakdown[activity.activity_type]++;
      });

      // Get recent activities (last 10)
      const recentActivities = allActivities.slice(0, 10);

      // Calculate session info (simplified - just JOIN/LEAVE pairs)
      const sessionCount = this.calculateSessionCount(allActivities);
      const averageSessionDuration =
        this.calculateAverageSessionDuration(allActivities);

      // Get rate limiting info
      const rateLimitInfo = this.getRateLimitInfo(username);

      return {
        exists: true,
        username: player.username,
        firstSeen: player.firstSeen,
        lastSeen: player.lastSeenTimestamp,
        daysSinceFirstSeen,
        isActive,
        totalDeaths: player.totalDeaths,
        lastDeath: player.lastDeathTimestamp,
        activityStats: {
          totalActivities: allActivities.length,
          activityBreakdown,
          recentActivities,
          sessionCount,
          averageSessionDuration,
          lastActivity: allActivities[0] || null,
        },
        rateLimitInfo,
      };
    } catch (error) {
      this.logger.error(`Failed to get enhanced stats for ${username}`, error);

      // Return minimal stats on error
      return {
        exists: false,
        username,
        firstSeen: null,
        lastSeen: null,
        daysSinceFirstSeen: 0,
        isActive: false,
        totalDeaths: 0,
        lastDeath: null,
        activityStats: {
          totalActivities: 0,
          activityBreakdown: {
            JOIN: 0,
            LEAVE: 0,
            CHAT: 0,
            ACHIEVEMENT: 0,
            DEATH: 0,
          },
          recentActivities: [],
          sessionCount: 0,
          averageSessionDuration: 0,
          lastActivity: null,
        },
        rateLimitInfo: {
          isRateLimited: false,
          limitedActivities: [],
        },
      };
    }
  }

  /**
   * Legacy method for backward compatibility
   */
  async getPlayerStats(username: string): Promise<{
    exists: boolean;
    totalDeaths: number;
    lastDeath: string | null;
    firstSeen: string | null;
    daysSinceFirstSeen: number;
  }> {
    const enhancedStats = await this.getEnhancedPlayerStats(username);

    return {
      exists: enhancedStats.exists,
      totalDeaths: enhancedStats.totalDeaths,
      lastDeath: enhancedStats.lastDeath,
      firstSeen: enhancedStats.firstSeen,
      daysSinceFirstSeen: enhancedStats.daysSinceFirstSeen,
    };
  }

  /**
   * Get player activities by type
   */
  async getPlayerActivities(
    username: string,
    activityType?: ActivityType
  ): Promise<PlayerActivity[]> {
    try {
      return await this.storageService.getPlayerActivities(
        username,
        activityType
      );
    } catch (error) {
      this.logger.error(`Failed to get activities for ${username}`, error);
      return [];
    }
  }

  /**
   * Calculate simple session count based on JOIN/LEAVE pairs
   */
  private calculateSessionCount(activities: PlayerActivity[]): number {
    const joinLeaveActivities = activities
      .filter((a) => a.activity_type === "JOIN" || a.activity_type === "LEAVE")
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

    let sessionCount = 0;
    let openSessions = 0;

    for (const activity of joinLeaveActivities) {
      if (activity.activity_type === "JOIN") {
        openSessions++;
        sessionCount++;
      } else if (activity.activity_type === "LEAVE" && openSessions > 0) {
        openSessions--;
      }
    }

    return sessionCount;
  }

  /**
   * Calculate average session duration in minutes
   */
  private calculateAverageSessionDuration(
    activities: PlayerActivity[]
  ): number {
    const joinLeaveActivities = activities
      .filter((a) => a.activity_type === "JOIN" || a.activity_type === "LEAVE")
      .sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

    const sessions: Array<{ start: Date; end?: Date }> = [];
    let currentSession: { start: Date; end?: Date } | null = null;

    for (const activity of joinLeaveActivities) {
      if (activity.activity_type === "JOIN") {
        if (currentSession && !currentSession.end) {
          // Close previous session if it was left open
          currentSession.end = new Date(activity.timestamp);
        }
        currentSession = { start: new Date(activity.timestamp) };
        sessions.push(currentSession);
      } else if (
        activity.activity_type === "LEAVE" &&
        currentSession &&
        !currentSession.end
      ) {
        currentSession.end = new Date(activity.timestamp);
        currentSession = null;
      }
    }

    // Calculate average from completed sessions
    const completedSessions = sessions.filter((s) => s.end);
    if (completedSessions.length === 0) return 0;

    const totalDuration = completedSessions.reduce((sum, session) => {
      return sum + (session.end!.getTime() - session.start.getTime());
    }, 0);

    return Math.round(totalDuration / completedSessions.length / (1000 * 60)); // Convert to minutes
  }

  /**
   * Get rate limiting information for a player
   */
  private getRateLimitInfo(username: string): {
    isRateLimited: boolean;
    limitedActivities: Array<{
      activityType: ActivityType;
      remainingSeconds: number;
    }>;
  } {
    const limitedActivities: Array<{
      activityType: ActivityType;
      remainingSeconds: number;
    }> = [];

    const activityTypes: ActivityType[] = [
      "JOIN",
      "LEAVE",
      "CHAT",
      "ACHIEVEMENT",
      "DEATH",
    ];

    for (const activityType of activityTypes) {
      if (this.rateLimiter.isActivityRateLimited(username, activityType)) {
        const remainingSeconds = this.rateLimiter.getActivityTimeUntilExpiry(
          username,
          activityType
        );
        limitedActivities.push({ activityType, remainingSeconds });
      }
    }

    return {
      isRateLimited: limitedActivities.length > 0,
      limitedActivities,
    };
  }

  // Legacy methods for backward compatibility

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
        if (new Date(player.lastUpdated) > cutoffDate) {
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

  async getTimeUntilRateLimitExpires(username: string): Promise<number> {
    return this.rateLimiter.getActivityTimeUntilExpiry(username, "DEATH");
  }
}
