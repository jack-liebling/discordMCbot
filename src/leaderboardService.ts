// LeaderboardService - Daily death leaderboard generation
import {
  DailyLeaderboard,
  LeaderboardEntry,
  SurvivalChampion,
  Player,
  IStorageService,
} from "./types";

export class LeaderboardService {
  private storageService: IStorageService;

  constructor(storageService: IStorageService) {
    this.storageService = storageService;
  }

  /**
   * Generate current leaderboard based on all tracked players
   */
  async generateLeaderboard(): Promise<DailyLeaderboard> {
    try {
      const playersData = await this.storageService.loadPlayers();
      const players = Object.values(playersData.players);

      // Generate leaderboard entries sorted by death count (ascending), then alphabetically
      const leaderboard = this.generateLeaderboardEntries(players);

      // Get survival champion from active players only
      const activePlayers = this.getActivePlayers(players);
      const survivalChampion = this.getSurvivalChampion(activePlayers);

      return {
        generatedAt: new Date(),
        totalPlayers: players.length,
        leaderboard,
        survivalChampion,
      };
    } catch (error) {
      console.error("Failed to generate leaderboard:", error);
      // Return empty leaderboard on error
      return {
        generatedAt: new Date(),
        totalPlayers: 0,
        leaderboard: [],
        survivalChampion: null,
      };
    }
  }

  /**
   * Check if leaderboard should be announced today
   */
  async shouldAnnounceToday(): Promise<boolean> {
    try {
      const config = await this.storageService.loadConfig();
      const leaderboardConfig = config?.leaderboard;

      if (!leaderboardConfig || !leaderboardConfig.enabled) {
        return false;
      }

      const currentDate = this.getCurrentESTDate();
      return currentDate !== leaderboardConfig.lastAnnouncementDate;
    } catch (error) {
      console.error("Failed to check announcement status:", error);
      return false;
    }
  }

  /**
   * Mark leaderboard as announced for today
   */
  async markAnnouncementComplete(): Promise<void> {
    try {
      let config = await this.storageService.loadConfig();
      if (!config) {
        config = {
          discord: { channelId: "", guildId: "", enabled: true },
        };
      }

      if (!config.leaderboard) {
        config.leaderboard = {
          lastAnnouncementDate: "",
          enabled: true,
          timezone: "EST",
          announcementTime: "09:00",
        };
      }

      config.leaderboard.lastAnnouncementDate = this.getCurrentESTDate();
      await this.storageService.saveConfig(config);
    } catch (error) {
      console.error("Failed to mark announcement complete:", error);
    }
  }

  /**
   * Reset announcement flag for testing purposes
   */
  async resetAnnouncementFlag(): Promise<void> {
    try {
      let config = await this.storageService.loadConfig();
      if (!config) {
        return; // No config to reset
      }

      if (config.leaderboard) {
        config.leaderboard.lastAnnouncementDate = "1970-01-01"; // Reset to epoch
        await this.storageService.saveConfig(config);
      }
    } catch (error) {
      console.error("Failed to reset announcement flag:", error);
    }
  }

  /**
   * Get survival champion from active players
   */
  getSurvivalChampion(players: Player[]): SurvivalChampion | null {
    if (players.length === 0) {
      return null;
    }

    const activePlayers = this.getActivePlayers(players);
    if (activePlayers.length === 0) {
      return null;
    }

    let champion: Player | null = null;
    let maxTimeAlive = 0;

    for (const player of activePlayers) {
      const timeAlive = this.calculateTimeAlive(player);
      if (timeAlive > maxTimeAlive) {
        maxTimeAlive = timeAlive;
        champion = player;
      }
    }

    if (!champion) {
      return null;
    }

    return {
      username: champion.username,
      timeAliveMs: maxTimeAlive,
      lastDeathTimestamp: champion.lastDeathTimestamp,
      formattedTimeAlive: this.formatTimeAlive(maxTimeAlive),
    };
  }

  /**
   * Filter players to only those active within 7 days
   */
  getActivePlayers(players: Player[]): Player[] {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    return players.filter((player) => {
      const lastSeen = new Date(player.lastSeenTimestamp);
      return lastSeen >= sevenDaysAgo;
    });
  }

  /**
   * Generate sorted leaderboard entries
   */
  private generateLeaderboardEntries(players: Player[]): LeaderboardEntry[] {
    // Sort by death count (descending - most deaths first), then alphabetically
    const sorted = [...players].sort((a, b) => {
      if (a.totalDeaths === b.totalDeaths) {
        return a.username.localeCompare(b.username);
      }
      return b.totalDeaths - a.totalDeaths; // Changed from a - b to b - a for descending
    });

    const activePlayers = this.getActivePlayers(players);
    const activeUsernames = new Set(activePlayers.map((p) => p.username));

    return sorted.map((player, index) => ({
      rank: index + 1,
      username: player.username,
      totalDeaths: player.totalDeaths,
      isActive: activeUsernames.has(player.username),
    }));
  }

  /**
   * Calculate time alive for a player in milliseconds
   */
  private calculateTimeAlive(player: Player): number {
    const now = Date.now();
    const lastDeathTime = player.lastDeathTimestamp
      ? new Date(player.lastDeathTimestamp).getTime()
      : new Date(player.firstSeen).getTime();
    return Math.max(0, now - lastDeathTime);
  }

  /**
   * Format time alive into human-readable string
   */
  private formatTimeAlive(timeAliveMs: number): string {
    if (timeAliveMs < 60000) {
      // Less than 1 minute
      return "less than 1 minute";
    }

    const seconds = Math.floor(timeAliveMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return this.formatDays(days, hours % 24);
    }

    if (hours > 0) {
      return this.formatHours(hours, minutes % 60);
    }

    return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
  }

  private formatDays(days: number, remainingHours: number): string {
    const dayText = `${days} day${days !== 1 ? "s" : ""}`;
    if (remainingHours > 0) {
      return `${dayText}, ${remainingHours} hour${
        remainingHours !== 1 ? "s" : ""
      }`;
    }
    return dayText;
  }

  private formatHours(hours: number, remainingMinutes: number): string {
    const hourText = `${hours} hour${hours !== 1 ? "s" : ""}`;
    if (remainingMinutes > 0) {
      return `${hourText}, ${remainingMinutes} minute${
        remainingMinutes !== 1 ? "s" : ""
      }`;
    }
    return hourText;
  }

  /**
   * Get current date in EST timezone as YYYY-MM-DD string
   */
  private getCurrentESTDate(): string {
    const now = new Date();
    // EST is UTC-5 (simplified, not handling DST)
    const estTime = new Date(now.getTime() - 5 * 60 * 60 * 1000);
    return estTime.toISOString().split("T")[0];
  }
}
