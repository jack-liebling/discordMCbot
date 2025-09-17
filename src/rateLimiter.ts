// T014: Rate limiting implementation enforcing 30-second cooldowns per player
import { Logger } from "./logger";

export class RateLimiter {
  private readonly logger = Logger.getInstance();
  private readonly rateLimitSeconds: number;
  private readonly playerCooldowns = new Map<string, number>();

  constructor(rateLimitSeconds: number = 30) {
    this.rateLimitSeconds = rateLimitSeconds;
  }

  isRateLimited(playerId: string, currentTime: Date = new Date()): boolean {
    const lastEventTime = this.playerCooldowns.get(playerId);

    if (!lastEventTime) {
      return false; // No previous event, not rate limited
    }

    const timeSinceLastEvent = currentTime.getTime() - lastEventTime;
    const rateLimitMs = this.rateLimitSeconds * 1000;

    const isLimited = timeSinceLastEvent < rateLimitMs;

    if (isLimited) {
      const remainingMs = rateLimitMs - timeSinceLastEvent;
      this.logger.debug(
        `Rate limit active for ${playerId}: ${Math.ceil(
          remainingMs / 1000
        )}s remaining`
      );
    }

    return isLimited;
  }

  recordEvent(playerId: string, eventTime: Date = new Date()): void {
    this.playerCooldowns.set(playerId, eventTime.getTime());
    this.logger.debug(
      `Recorded event for ${playerId} at ${eventTime.toISOString()}`
    );
  }

  getTimeUntilExpiry(playerId: string, currentTime: Date = new Date()): number {
    const lastEventTime = this.playerCooldowns.get(playerId);

    if (!lastEventTime) {
      return 0; // No cooldown active
    }

    const timeSinceLastEvent = currentTime.getTime() - lastEventTime;
    const rateLimitMs = this.rateLimitSeconds * 1000;

    if (timeSinceLastEvent >= rateLimitMs) {
      return 0; // Cooldown expired
    }

    return Math.ceil((rateLimitMs - timeSinceLastEvent) / 1000);
  }

  clearCooldown(playerId: string): void {
    const wasLimited = this.playerCooldowns.has(playerId);
    this.playerCooldowns.delete(playerId);

    if (wasLimited) {
      this.logger.debug(`Cleared cooldown for ${playerId}`);
    }
  }

  clearAllCooldowns(): void {
    const count = this.playerCooldowns.size;
    this.playerCooldowns.clear();

    if (count > 0) {
      this.logger.info(`Cleared all ${count} player cooldowns`);
    }
  }

  getActiveCooldowns(): Array<{ playerId: string; remainingSeconds: number }> {
    const currentTime = new Date();
    const activeCooldowns: Array<{
      playerId: string;
      remainingSeconds: number;
    }> = [];

    this.playerCooldowns.forEach((lastEventTime, playerId) => {
      const remaining = this.getTimeUntilExpiry(playerId, currentTime);
      if (remaining > 0) {
        activeCooldowns.push({ playerId, remainingSeconds: remaining });
      }
    });

    return activeCooldowns.sort(
      (a, b) => b.remainingSeconds - a.remainingSeconds
    );
  }

  // Clean up expired cooldowns to prevent memory leaks
  cleanupExpiredCooldowns(currentTime: Date = new Date()): number {
    let cleanedCount = 0;
    const rateLimitMs = this.rateLimitSeconds * 1000;

    this.playerCooldowns.forEach((lastEventTime, playerId) => {
      const timeSinceLastEvent = currentTime.getTime() - lastEventTime;

      if (timeSinceLastEvent >= rateLimitMs) {
        this.playerCooldowns.delete(playerId);
        cleanedCount++;
      }
    });

    if (cleanedCount > 0) {
      this.logger.debug(`Cleaned up ${cleanedCount} expired cooldowns`);
    }

    return cleanedCount;
  }

  // Get rate limiter statistics
  getStats(): {
    rateLimitSeconds: number;
    activeCooldowns: number;
    totalTrackedPlayers: number;
  } {
    const activeCooldowns = this.getActiveCooldowns();

    return {
      rateLimitSeconds: this.rateLimitSeconds,
      activeCooldowns: activeCooldowns.length,
      totalTrackedPlayers: this.playerCooldowns.size,
    };
  }

  // Update rate limit duration (useful for configuration changes)
  updateRateLimit(newRateLimitSeconds: number): void {
    if (newRateLimitSeconds <= 0) {
      throw new Error("Rate limit must be a positive number");
    }

    const oldLimit = this.rateLimitSeconds;
    (this as any).rateLimitSeconds = newRateLimitSeconds;

    this.logger.info(
      `Updated rate limit from ${oldLimit}s to ${newRateLimitSeconds}s`
    );

    // Clean up cooldowns that would now be expired under the new limit
    this.cleanupExpiredCooldowns();
  }
}
