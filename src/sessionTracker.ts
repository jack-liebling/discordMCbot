// SessionTracker - Calculate and update online time from JOIN/LEAVE events
import { IStorageService } from "./types";
import { Logger } from "./logger";

export class SessionTracker {
  private readonly storageService: IStorageService;
  private readonly logger = Logger.getInstance();

  constructor(storageService: IStorageService) {
    this.storageService = storageService;
  }

  /**
   * Calculate total online time for a player from their activity log
   */
  async calculateOnlineTime(username: string): Promise<number> {
    try {
      // Get all JOIN and LEAVE events for this player
      const joinEvents = await this.storageService.getPlayerActivities(
        username,
        "JOIN"
      );
      const leaveEvents = await this.storageService.getPlayerActivities(
        username,
        "LEAVE"
      );

      // Sort by timestamp
      joinEvents.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      leaveEvents.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      let totalOnlineTime = 0;
      let joinIndex = 0;
      let leaveIndex = 0;

      // Process JOIN/LEAVE pairs to calculate session durations
      while (joinIndex < joinEvents.length) {
        const joinTime = joinEvents[joinIndex].timestamp;

        // Find the corresponding LEAVE event after this JOIN
        let leaveTime: Date | null = null;
        while (leaveIndex < leaveEvents.length) {
          if (leaveEvents[leaveIndex].timestamp > joinTime) {
            leaveTime = leaveEvents[leaveIndex].timestamp;
            leaveIndex++;
            break;
          }
          leaveIndex++;
        }

        if (leaveTime) {
          // Complete session - calculate duration
          const sessionDuration = leaveTime.getTime() - joinTime.getTime();
          totalOnlineTime += sessionDuration;
          this.logger.debug(`Session for ${username}: ${sessionDuration}ms`, {
            join: joinTime.toISOString(),
            leave: leaveTime.toISOString(),
          });
        } else {
          // Incomplete session (player still online or bot missed LEAVE)
          // Don't count ongoing sessions in total time
          this.logger.debug(
            `Incomplete session for ${username} starting at ${joinTime.toISOString()}`
          );
        }

        joinIndex++;
      }

      this.logger.debug(
        `Total online time for ${username}: ${totalOnlineTime}ms`
      );
      return totalOnlineTime;
    } catch (error) {
      this.logger.error(
        `Failed to calculate online time for ${username}`,
        error
      );
      return 0;
    }
  }

  /**
   * Update a player's online time in the database
   */
  async updatePlayerOnlineTime(username: string): Promise<void> {
    try {
      const onlineTime = await this.calculateOnlineTime(username);

      await this.storageService.updatePlayer(username, {
        onlineTimeMs: onlineTime,
      });

      this.logger.debug(`Updated online time for ${username}: ${onlineTime}ms`);
    } catch (error) {
      this.logger.error(`Failed to update online time for ${username}`, error);
    }
  }

  /**
   * Calculate online time since a specific timestamp
   */
  async calculateOnlineTimeSince(
    username: string,
    sinceTimestamp: Date
  ): Promise<number> {
    try {
      const joinEvents = await this.storageService.getPlayerActivities(
        username,
        "JOIN"
      );
      const leaveEvents = await this.storageService.getPlayerActivities(
        username,
        "LEAVE"
      );

      // Filter events to only those after the specified timestamp
      const relevantJoins = joinEvents.filter(
        (event) => event.timestamp > sinceTimestamp
      );
      const relevantLeaves = leaveEvents.filter(
        (event) => event.timestamp > sinceTimestamp
      );

      // Sort by timestamp
      relevantJoins.sort(
        (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
      );
      relevantLeaves.sort(
        (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
      );

      let onlineTimeSince = 0;
      let joinIndex = 0;
      let leaveIndex = 0;

      // Check if player was already online at the sinceTimestamp
      const lastJoinBefore = joinEvents
        .filter((event) => event.timestamp <= sinceTimestamp)
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];

      const lastLeaveBefore = leaveEvents
        .filter((event) => event.timestamp <= sinceTimestamp)
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];

      let wasOnlineAtStart = false;
      if (
        lastJoinBefore &&
        (!lastLeaveBefore ||
          lastJoinBefore.timestamp > lastLeaveBefore.timestamp)
      ) {
        wasOnlineAtStart = true;
      }

      // If player was online at start, count time until first leave after sinceTimestamp
      if (wasOnlineAtStart && relevantLeaves.length > 0) {
        const firstLeave = relevantLeaves[0];
        onlineTimeSince +=
          firstLeave.timestamp.getTime() - sinceTimestamp.getTime();
        leaveIndex++;
      }

      // Process JOIN/LEAVE pairs after the since timestamp
      while (joinIndex < relevantJoins.length) {
        const joinTime = relevantJoins[joinIndex].timestamp;

        // Find corresponding LEAVE
        let leaveTime: Date | null = null;
        while (leaveIndex < relevantLeaves.length) {
          if (relevantLeaves[leaveIndex].timestamp > joinTime) {
            leaveTime = relevantLeaves[leaveIndex].timestamp;
            leaveIndex++;
            break;
          }
          leaveIndex++;
        }

        if (leaveTime) {
          const sessionDuration = leaveTime.getTime() - joinTime.getTime();
          onlineTimeSince += sessionDuration;
        }
        // Note: Don't count incomplete sessions for "time since" calculations

        joinIndex++;
      }

      this.logger.debug(
        `Online time since ${sinceTimestamp.toISOString()} for ${username}: ${onlineTimeSince}ms`
      );
      return onlineTimeSince;
    } catch (error) {
      this.logger.error(
        `Failed to calculate online time since timestamp for ${username}`,
        error
      );
      return 0;
    }
  }

  /**
   * Get current session start time for a player (if online)
   */
  async getCurrentSessionStart(username: string): Promise<Date | null> {
    try {
      const joinEvents = await this.storageService.getPlayerActivities(
        username,
        "JOIN"
      );
      const leaveEvents = await this.storageService.getPlayerActivities(
        username,
        "LEAVE"
      );

      if (joinEvents.length === 0) {
        return null; // Never joined
      }

      // Get most recent JOIN and LEAVE events
      const lastJoin = joinEvents.sort(
        (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
      )[0];
      const lastLeave = leaveEvents.sort(
        (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
      )[0];

      // If last JOIN is more recent than last LEAVE (or no leaves), player is online
      if (!lastLeave || lastJoin.timestamp > lastLeave.timestamp) {
        return lastJoin.timestamp;
      }

      return null; // Player is offline
    } catch (error) {
      this.logger.error(
        `Failed to get current session start for ${username}`,
        error
      );
      return null;
    }
  }

  /**
   * Update online time for all players (useful on bot startup)
   */
  async updateAllPlayersOnlineTime(): Promise<void> {
    try {
      const players = await this.storageService.getAllPlayers();

      for (const player of players) {
        await this.updatePlayerOnlineTime(player.username);
      }

      this.logger.info(`Updated online time for ${players.length} players`);
    } catch (error) {
      this.logger.error("Failed to update online time for all players", error);
    }
  }

  /**
   * Format online time duration into human-readable string
   */
  formatOnlineTime(timeMs: number): string {
    if (timeMs <= 0) {
      return "0 minutes";
    }

    const minutes = Math.floor(timeMs / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      const remainingHours = hours % 24;
      if (remainingHours > 0) {
        return `${days}d ${remainingHours}h`;
      }
      const dayText = days === 1 ? "day" : "days";
      return `${days} ${dayText}`;
    }

    if (hours > 0) {
      const remainingMinutes = minutes % 60;
      if (remainingMinutes > 0) {
        return `${hours}h ${remainingMinutes}m`;
      }
      const hourText = hours === 1 ? "hour" : "hours";
      return `${hours} ${hourText}`;
    }

    const minuteText = minutes === 1 ? "minute" : "minutes";
    return `${minutes} ${minuteText}`;
  }

  /**
   * Calculate current session time (from last JOIN to specified time)
   */
  async calculateCurrentSessionTime(
    username: string,
    endTime: Date
  ): Promise<number> {
    try {
      // Get the most recent JOIN event
      const joinEvents = await this.storageService.getPlayerActivities(
        username,
        "JOIN"
      );

      if (joinEvents.length === 0) {
        return 0; // No JOIN events found
      }

      const lastJoin = joinEvents[0]; // Most recent JOIN

      // Check if there's a LEAVE event after this JOIN
      const leaveEvents = await this.storageService.getPlayerActivities(
        username,
        "LEAVE"
      );

      // Find if there's a LEAVE after the last JOIN
      const leaveAfterJoin = leaveEvents.find(
        (leave) => leave.timestamp > lastJoin.timestamp
      );

      if (leaveAfterJoin) {
        // Player has already left, no current session
        return 0;
      }

      // Calculate time from last JOIN to the specified end time
      const sessionDuration = endTime.getTime() - lastJoin.timestamp.getTime();

      return Math.max(0, sessionDuration); // Ensure non-negative
    } catch (error) {
      this.logger.error(
        `Failed to calculate current session time for ${username}`,
        error
      );
      return 0;
    }
  }
}
