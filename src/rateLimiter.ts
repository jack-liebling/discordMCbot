// Enhanced Rate limiting implementation with activity-specific controls
import { Logger } from "./logger";
import { ActivityType } from "./types";

export interface ActivityRateLimitConfig {
  [key: string]: number; // ActivityType -> seconds
}

export interface RateLimitOptions {
  defaultRateLimitSeconds?: number;
  activitySpecificLimits?: ActivityRateLimitConfig;
}

export class RateLimiter {
  private readonly logger = Logger.getInstance();
  private readonly defaultRateLimitSeconds: number;
  private readonly activitySpecificLimits: ActivityRateLimitConfig;

  // Track cooldowns per player per activity type
  private readonly playerActivityCooldowns = new Map<
    string,
    Map<ActivityType, number>
  >();

  // Legacy cooldowns for backward compatibility (deaths)
  private readonly playerCooldowns = new Map<string, number>();

  constructor(options: RateLimitOptions = {}) {
    this.defaultRateLimitSeconds = options.defaultRateLimitSeconds || 30;
    this.activitySpecificLimits = {
      DEATH: 5, // 5 seconds between deaths (reduced from 30)
      JOIN: 5, // 5 seconds between joins (prevent spam rejoining)
      LEAVE: 5, // 5 seconds between leaves
      CHAT: 1, // 1 second between chat messages (anti-spam)
      ACHIEVEMENT: 2, // 2 seconds between achievements
      ...options.activitySpecificLimits,
    };

    this.logger.info("Enhanced rate limiter initialized", {
      defaultLimit: this.defaultRateLimitSeconds,
      activityLimits: this.activitySpecificLimits,
    });
  }

  /**
   * Check if player is rate limited for a specific activity type
   */
  isActivityRateLimited(
    playerId: string,
    activityType: ActivityType,
    currentTime: Date = new Date()
  ): boolean {
    const rateLimitSeconds =
      this.activitySpecificLimits[activityType] || this.defaultRateLimitSeconds;
    const playerActivities = this.playerActivityCooldowns.get(playerId);

    if (!playerActivities) {
      return false; // No previous activities, not rate limited
    }

    const lastEventTime = playerActivities.get(activityType);
    if (!lastEventTime) {
      return false; // No previous event of this type, not rate limited
    }

    const timeSinceLastEvent = currentTime.getTime() - lastEventTime;
    const rateLimitMs = rateLimitSeconds * 1000;
    const isLimited = timeSinceLastEvent < rateLimitMs;

    if (isLimited) {
      const remainingMs = rateLimitMs - timeSinceLastEvent;
      this.logger.debug(
        `Rate limit active for ${playerId} (${activityType}): ${Math.ceil(
          remainingMs / 1000
        )}s remaining`
      );
    }

    return isLimited;
  }

  /**
   * Record an activity event for rate limiting
   */
  recordActivityEvent(
    playerId: string,
    activityType: ActivityType,
    eventTime: Date = new Date()
  ): void {
    let playerActivities = this.playerActivityCooldowns.get(playerId);

    if (!playerActivities) {
      playerActivities = new Map();
      this.playerActivityCooldowns.set(playerId, playerActivities);
    }

    playerActivities.set(activityType, eventTime.getTime());

    this.logger.debug(
      `Recorded ${activityType} event for ${playerId} at ${eventTime.toISOString()}`
    );
  }

  /**
   * Get time until rate limit expires for specific activity
   */
  getActivityTimeUntilExpiry(
    playerId: string,
    activityType: ActivityType,
    currentTime: Date = new Date()
  ): number {
    const rateLimitSeconds =
      this.activitySpecificLimits[activityType] || this.defaultRateLimitSeconds;
    const playerActivities = this.playerActivityCooldowns.get(playerId);

    if (!playerActivities) {
      return 0; // No cooldown active
    }

    const lastEventTime = playerActivities.get(activityType);
    if (!lastEventTime) {
      return 0; // No cooldown for this activity type
    }

    const timeSinceLastEvent = currentTime.getTime() - lastEventTime;
    const rateLimitMs = rateLimitSeconds * 1000;

    if (timeSinceLastEvent >= rateLimitMs) {
      return 0; // Cooldown expired
    }

    return Math.ceil((rateLimitMs - timeSinceLastEvent) / 1000);
  }

  /**
   * Clear cooldown for specific activity type
   */
  clearActivityCooldown(playerId: string, activityType?: ActivityType): void {
    const playerActivities = this.playerActivityCooldowns.get(playerId);

    if (!playerActivities) {
      return;
    }

    if (activityType) {
      const wasLimited = playerActivities.has(activityType);
      playerActivities.delete(activityType);

      if (wasLimited) {
        this.logger.debug(`Cleared ${activityType} cooldown for ${playerId}`);
      }

      // Clean up empty player maps
      if (playerActivities.size === 0) {
        this.playerActivityCooldowns.delete(playerId);
      }
    } else {
      // Clear all activity cooldowns for player
      const activityCount = playerActivities.size;
      this.playerActivityCooldowns.delete(playerId);

      if (activityCount > 0) {
        this.logger.debug(
          `Cleared all ${activityCount} activity cooldowns for ${playerId}`
        );
      }
    }
  }

  /**
   * Get all active cooldowns with activity breakdown
   */
  getActiveActivityCooldowns(): Array<{
    playerId: string;
    activityType: ActivityType;
    remainingSeconds: number;
  }> {
    const currentTime = new Date();
    const activeCooldowns: Array<{
      playerId: string;
      activityType: ActivityType;
      remainingSeconds: number;
    }> = [];

    this.playerActivityCooldowns.forEach((playerActivities, playerId) => {
      playerActivities.forEach((lastEventTime, activityType) => {
        const remaining = this.getActivityTimeUntilExpiry(
          playerId,
          activityType,
          currentTime
        );
        if (remaining > 0) {
          activeCooldowns.push({
            playerId,
            activityType,
            remainingSeconds: remaining,
          });
        }
      });
    });

    return activeCooldowns.sort(
      (a, b) => b.remainingSeconds - a.remainingSeconds
    );
  }

  /**
   * Clean up expired activity cooldowns
   */
  cleanupExpiredActivityCooldowns(currentTime: Date = new Date()): number {
    let cleanedCount = 0;

    this.playerActivityCooldowns.forEach((playerActivities, playerId) => {
      const activitiesToRemove: ActivityType[] = [];

      playerActivities.forEach((lastEventTime, activityType) => {
        const rateLimitSeconds =
          this.activitySpecificLimits[activityType] ||
          this.defaultRateLimitSeconds;
        const rateLimitMs = rateLimitSeconds * 1000;
        const timeSinceLastEvent = currentTime.getTime() - lastEventTime;

        if (timeSinceLastEvent >= rateLimitMs) {
          activitiesToRemove.push(activityType);
          cleanedCount++;
        }
      });

      activitiesToRemove.forEach((activityType) => {
        playerActivities.delete(activityType);
      });

      // Clean up empty player maps
      if (playerActivities.size === 0) {
        this.playerActivityCooldowns.delete(playerId);
      }
    });

    if (cleanedCount > 0) {
      this.logger.debug(
        `Cleaned up ${cleanedCount} expired activity cooldowns`
      );
    }

    return cleanedCount;
  }

  /**
   * Update activity-specific rate limits
   */
  updateActivityRateLimit(
    activityType: ActivityType,
    newRateLimitSeconds: number
  ): void {
    if (newRateLimitSeconds <= 0) {
      throw new Error("Rate limit must be a positive number");
    }

    const oldLimit =
      this.activitySpecificLimits[activityType] || this.defaultRateLimitSeconds;
    this.activitySpecificLimits[activityType] = newRateLimitSeconds;

    this.logger.info(
      `Updated ${activityType} rate limit from ${oldLimit}s to ${newRateLimitSeconds}s`
    );

    // Clean up cooldowns that would now be expired under the new limit
    this.cleanupExpiredActivityCooldowns();
  }

  /**
   * Get enhanced statistics with activity breakdown
   */
  getEnhancedStats(): {
    defaultRateLimitSeconds: number;
    activitySpecificLimits: ActivityRateLimitConfig;
    totalActiveCooldowns: number;
    totalTrackedPlayers: number;
    cooldownsByActivity: Record<ActivityType, number>;
  } {
    const activeCooldowns = this.getActiveActivityCooldowns();
    const cooldownsByActivity: Record<string, number> = {};

    // Initialize all activity types with 0
    Object.keys(this.activitySpecificLimits).forEach((activityType) => {
      cooldownsByActivity[activityType] = 0;
    });

    // Count active cooldowns by activity type
    activeCooldowns.forEach((cooldown) => {
      cooldownsByActivity[cooldown.activityType] =
        (cooldownsByActivity[cooldown.activityType] || 0) + 1;
    });

    return {
      defaultRateLimitSeconds: this.defaultRateLimitSeconds,
      activitySpecificLimits: { ...this.activitySpecificLimits },
      totalActiveCooldowns: activeCooldowns.length,
      totalTrackedPlayers: this.playerActivityCooldowns.size,
      cooldownsByActivity: cooldownsByActivity as Record<ActivityType, number>,
    };
  }

  // Legacy methods for backward compatibility with existing death tracking

  /**
   * @deprecated Use isActivityRateLimited with ActivityType.DEATH instead
   */
  isRateLimited(playerId: string, currentTime: Date = new Date()): boolean {
    return this.isActivityRateLimited(playerId, "DEATH", currentTime);
  }

  /**
   * @deprecated Use recordActivityEvent with ActivityType.DEATH instead
   */
  recordEvent(playerId: string, eventTime: Date = new Date()): void {
    this.recordActivityEvent(playerId, "DEATH", eventTime);
    // Also maintain legacy cooldowns map for backward compatibility
    this.playerCooldowns.set(playerId, eventTime.getTime());
  }

  /**
   * @deprecated Use getActivityTimeUntilExpiry with ActivityType.DEATH instead
   */
  getTimeUntilExpiry(playerId: string, currentTime: Date = new Date()): number {
    return this.getActivityTimeUntilExpiry(playerId, "DEATH", currentTime);
  }

  /**
   * @deprecated Use clearActivityCooldown with ActivityType.DEATH instead
   */
  clearCooldown(playerId: string): void {
    this.clearActivityCooldown(playerId, "DEATH");
    this.playerCooldowns.delete(playerId);
  }

  /**
   * @deprecated Use clearActivityCooldown without activityType instead
   */
  clearAllCooldowns(): void {
    const count = this.playerActivityCooldowns.size;
    this.playerActivityCooldowns.clear();
    this.playerCooldowns.clear();

    if (count > 0) {
      this.logger.info(`Cleared all ${count} player cooldowns`);
    }
  }

  /**
   * @deprecated Use getActiveActivityCooldowns instead
   */
  getActiveCooldowns(): Array<{ playerId: string; remainingSeconds: number }> {
    const activityCooldowns = this.getActiveActivityCooldowns();

    // Filter for DEATH activities for backward compatibility
    return activityCooldowns
      .filter((cooldown) => cooldown.activityType === "DEATH")
      .map((cooldown) => ({
        playerId: cooldown.playerId,
        remainingSeconds: cooldown.remainingSeconds,
      }));
  }

  /**
   * @deprecated Use cleanupExpiredActivityCooldowns instead
   */
  cleanupExpiredCooldowns(currentTime: Date = new Date()): number {
    return this.cleanupExpiredActivityCooldowns(currentTime);
  }

  /**
   * @deprecated Use getEnhancedStats instead
   */
  getStats(): {
    rateLimitSeconds: number;
    activeCooldowns: number;
    totalTrackedPlayers: number;
  } {
    const enhancedStats = this.getEnhancedStats();

    return {
      rateLimitSeconds:
        enhancedStats.activitySpecificLimits.DEATH ||
        this.defaultRateLimitSeconds,
      activeCooldowns: enhancedStats.cooldownsByActivity.DEATH || 0,
      totalTrackedPlayers: enhancedStats.totalTrackedPlayers,
    };
  }

  /**
   * @deprecated Use updateActivityRateLimit with ActivityType.DEATH instead
   */
  updateRateLimit(newRateLimitSeconds: number): void {
    this.updateActivityRateLimit("DEATH", newRateLimitSeconds);
  }
}
