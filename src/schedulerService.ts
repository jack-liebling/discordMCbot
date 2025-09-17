// SchedulerService - Daily timing for leaderboard announcements
import { LeaderboardService } from "./leaderboardService";
import { DailyLeaderboard } from "./types";

export class SchedulerService {
  private intervalId?: NodeJS.Timeout;
  private leaderboardService: LeaderboardService;
  private announcementCallback?: (
    leaderboard: DailyLeaderboard
  ) => Promise<void>;
  private isRunning = false;

  constructor(
    leaderboardService: LeaderboardService,
    announcementCallback?: (leaderboard: DailyLeaderboard) => Promise<void>
  ) {
    this.leaderboardService = leaderboardService;
    this.announcementCallback = announcementCallback;
  }

  /**
   * Start the daily scheduler
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log("Scheduler already running");
      return;
    }

    console.log("Starting daily leaderboard scheduler...");
    this.isRunning = true;

    // Check every minute for the announcement time
    this.intervalId = setInterval(async () => {
      try {
        if (this.isAnnouncementTime()) {
          const shouldAnnounce =
            await this.leaderboardService.shouldAnnounceToday();
          if (shouldAnnounce) {
            await this.triggerAnnouncement();
          }
        }
      } catch (error) {
        console.error("Error in scheduler interval:", error);
      }
    }, 60000); // Check every 60 seconds

    console.log(
      "Daily leaderboard scheduler started (checking every 60 seconds)"
    );
  }

  /**
   * Stop the daily scheduler
   */
  async stop(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.isRunning = false;
    console.log("Daily leaderboard scheduler stopped");
  }

  /**
   * Check if current time matches announcement schedule (9:00 AM EST)
   */
  isAnnouncementTime(): boolean {
    const now = new Date();
    // Convert to EST (UTC-5, simplified without DST handling)
    const estTime = new Date(now.getTime() - 5 * 60 * 60 * 1000);

    const hours = estTime.getUTCHours();
    const minutes = estTime.getUTCMinutes();

    // Check if it's 9:00 AM EST (09:00)
    return hours === 9 && minutes === 0;
  }

  /**
   * Get time until next announcement in milliseconds
   */
  getTimeUntilNextAnnouncement(): number {
    const now = new Date();
    const estTime = new Date(now.getTime() - 5 * 60 * 60 * 1000);

    // Create next announcement time (9:00 AM EST today or tomorrow)
    const nextAnnouncement = new Date(estTime);
    nextAnnouncement.setUTCHours(9, 0, 0, 0);

    // If we've passed today's announcement time, schedule for tomorrow
    if (nextAnnouncement <= estTime) {
      nextAnnouncement.setUTCDate(nextAnnouncement.getUTCDate() + 1);
    }

    // Convert back to local time and return difference
    const nextAnnouncementLocal = new Date(
      nextAnnouncement.getTime() + 5 * 60 * 60 * 1000
    );
    return Math.max(0, nextAnnouncementLocal.getTime() - now.getTime());
  }

  /**
   * Force trigger announcement (for testing/manual execution)
   */
  async triggerAnnouncement(): Promise<void> {
    try {
      console.log("Triggering daily leaderboard announcement...");

      // Generate the leaderboard
      const leaderboard = await this.leaderboardService.generateLeaderboard();

      // Mark as announced to prevent duplicates
      await this.leaderboardService.markAnnouncementComplete();

      // Send to Discord via callback
      if (this.announcementCallback) {
        await this.announcementCallback(leaderboard);
      } else {
        console.log(
          "No announcement callback configured - leaderboard generated but not sent"
        );
      }

      console.log("Leaderboard announcement completed:", {
        totalPlayers: leaderboard.totalPlayers,
        survivalChampion: leaderboard.survivalChampion?.username,
        topPlayer: leaderboard.leaderboard[0]?.username,
      });
    } catch (error) {
      console.error("Failed to trigger leaderboard announcement:", error);
    }
  }

  /**
   * Get scheduler status
   */
  getStatus(): { isRunning: boolean; nextAnnouncementMs: number } {
    return {
      isRunning: this.isRunning,
      nextAnnouncementMs: this.getTimeUntilNextAnnouncement(),
    };
  }

  /**
   * Set the announcement callback
   */
  setAnnouncementCallback(
    callback: (leaderboard: DailyLeaderboard) => Promise<void>
  ): void {
    this.announcementCallback = callback;
  }
}
