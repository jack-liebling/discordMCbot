// T015: Discord announcement service sending formatted messages to channels
import { Client, TextChannel } from "discord.js";
import { DiscordFormatter } from "./discord";
import { DeathEvent, DailyLeaderboard } from "./types";
import { LeaderboardFormatter } from "./leaderboardFormatter";
import { Logger } from "./logger";

export class AnnouncementService {
  private readonly client: Client;
  private readonly formatter: DiscordFormatter;
  private readonly leaderboardFormatter: LeaderboardFormatter;
  private readonly logger = Logger.getInstance();
  private readonly channelId: string;
  private readonly guildId: string;

  private channel: TextChannel | null = null;
  private isReady = false;
  private messageQueue: Array<() => Promise<void>> = [];
  private processingQueue = false;

  constructor(
    client: Client,
    formatter: DiscordFormatter,
    channelId: string,
    guildId: string
  ) {
    this.client = client;
    this.formatter = formatter;
    this.leaderboardFormatter = new LeaderboardFormatter();
    this.channelId = channelId;
    this.guildId = guildId;
  }

  async initialize(): Promise<void> {
    try {
      // Get the guild
      const guild = await this.client.guilds.fetch(this.guildId);
      if (!guild) {
        throw new Error(`Guild with ID ${this.guildId} not found`);
      }

      // Get the channel
      const channel = await guild.channels.fetch(this.channelId);
      if (!channel) {
        throw new Error(`Channel with ID ${this.channelId} not found`);
      }

      if (!channel.isTextBased()) {
        throw new Error(`Channel ${this.channelId} is not a text channel`);
      }

      this.channel = channel as TextChannel;
      this.isReady = true;

      this.logger.info(
        `Announcement service initialized for channel #${this.channel.name} in ${guild.name}`
      );

      // Process any queued messages
      await this.processMessageQueue();
    } catch (error) {
      this.logger.error("Failed to initialize announcement service", error);
      throw error;
    }
  }

  async announcePlayerDeath(
    deathEvent: DeathEvent,
    totalDeaths: number,
    previousDeathTimestamp?: Date
  ): Promise<void> {
    if (!this.isReady || !this.channel) {
      // Queue the message for later processing
      this.queueMessage(() =>
        this.announcePlayerDeath(
          deathEvent,
          totalDeaths,
          previousDeathTimestamp
        )
      );
      return;
    }

    try {
      const embed = this.formatter.createDeathAnnouncementEmbed(
        deathEvent,
        totalDeaths,
        previousDeathTimestamp
      );

      // Validate embed before sending
      const validation = this.formatter.validateEmbed(embed);
      if (!validation.isValid) {
        this.logger.error("Invalid embed created", {
          errors: validation.errors,
        });
        return;
      }

      await this.channel.send({ embeds: [embed] });

      this.logger.info(`Death announcement sent for ${deathEvent.playerId}`, {
        cause: deathEvent.cause,
        totalDeaths,
        channel: this.channel.name,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send death announcement for ${deathEvent.playerId}`,
        error
      );

      // Try to send a simplified message as fallback
      await this.sendFallbackMessage(
        `💀 ${deathEvent.playerId} died (Death #${totalDeaths})`
      );
    }
  }

  async sendConnectionError(errorMessage: string): Promise<void> {
    if (!this.isReady || !this.channel) {
      this.logger.warn("Cannot send connection error - service not ready");
      return;
    }

    try {
      const embed = this.formatter.createConnectionErrorEmbed(errorMessage);
      await this.channel.send({ embeds: [embed] });

      this.logger.debug("Connection error message sent", { errorMessage });
    } catch (error) {
      this.logger.error("Failed to send connection error message", error);
      await this.sendFallbackMessage(`⚠️ Connection Issue: ${errorMessage}`);
    }
  }

  async sendRateLimitNotice(username: string): Promise<void> {
    if (!this.isReady || !this.channel) {
      this.logger.warn("Cannot send rate limit notice - service not ready");
      return;
    }

    try {
      const message = this.formatter.createRateLimitMessage(username);
      await this.channel.send({ content: message });

      this.logger.debug("Rate limit notice sent", { username });
    } catch (error) {
      this.logger.error("Failed to send rate limit notice", error);
    }
  }

  async sendBotStartup(): Promise<void> {
    if (!this.isReady || !this.channel) {
      this.queueMessage(() => this.sendBotStartup());
      return;
    }

    try {
      const embed = this.formatter.createStartupMessage();
      await this.channel.send({ embeds: [embed] });

      this.logger.info("Bot startup message sent");
    } catch (error) {
      this.logger.error("Failed to send startup message", error);
    }
  }

  async sendBotShutdown(): Promise<void> {
    if (!this.isReady || !this.channel) {
      this.logger.warn("Cannot send shutdown message - service not ready");
      return;
    }

    try {
      const embed = this.formatter.createShutdownMessage();
      await this.channel.send({ embeds: [embed] });

      this.logger.info("Bot shutdown message sent");
    } catch (error) {
      this.logger.error("Failed to send shutdown message", error);
    }
  }

  async announceDailyLeaderboard(leaderboard: DailyLeaderboard): Promise<void> {
    if (!this.isReady || !this.channel) {
      this.queueMessage(() => this.announceDailyLeaderboard(leaderboard));
      return;
    }

    try {
      const embed =
        this.leaderboardFormatter.createLeaderboardEmbed(leaderboard);
      await this.channel.send({ embeds: [embed] });

      this.logger.info("Daily leaderboard announcement sent", {
        entries: leaderboard.leaderboard.length,
        champion: leaderboard.survivalChampion?.username || "none",
        channel: this.channel.name,
      });
    } catch (error) {
      this.logger.error("Failed to send daily leaderboard", error);

      // Try to send a simplified fallback message
      const topPlayer = leaderboard.leaderboard[0];
      const fallbackText = topPlayer
        ? `📊 Daily Death Leaderboard - Top: ${topPlayer.username} (${topPlayer.totalDeaths} deaths)`
        : "📊 Daily Death Leaderboard - No deaths recorded today";

      await this.sendFallbackMessage(fallbackText);
    }
  }

  private async sendFallbackMessage(content: string): Promise<void> {
    if (!this.channel) return;

    try {
      await this.channel.send({ content });
      this.logger.debug("Fallback message sent", { content });
    } catch (error) {
      this.logger.error("Failed to send fallback message", error);
    }
  }

  private queueMessage(messageFunction: () => Promise<void>): void {
    this.messageQueue.push(messageFunction);
    this.logger.debug("Message queued for later processing");

    // Try to process queue if not already processing
    if (!this.processingQueue) {
      this.processMessageQueue().catch((error) => {
        this.logger.error("Error processing message queue", error);
      });
    }
  }

  private async processMessageQueue(): Promise<void> {
    if (
      this.processingQueue ||
      !this.isReady ||
      this.messageQueue.length === 0
    ) {
      return;
    }

    this.processingQueue = true;

    try {
      while (this.messageQueue.length > 0 && this.isReady) {
        const messageFunction = this.messageQueue.shift();
        if (messageFunction) {
          await messageFunction();
          // Small delay between messages to avoid rate limits
          await this.sleep(100);
        }
      }
    } catch (error) {
      this.logger.error("Error processing queued messages", error);
    } finally {
      this.processingQueue = false;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Check if the service is ready to send messages
  isServiceReady(): boolean {
    return this.isReady && this.channel !== null;
  }

  // Get service status information
  getStatus(): {
    isReady: boolean;
    channelName: string | null;
    guildName: string | null;
    queuedMessages: number;
  } {
    return {
      isReady: this.isReady,
      channelName: this.channel?.name || null,
      guildName: this.channel?.guild.name || null,
      queuedMessages: this.messageQueue.length,
    };
  }

  // Method to test the service by sending a test message
  async sendTestMessage(): Promise<boolean> {
    if (!this.isReady || !this.channel) {
      return false;
    }

    try {
      await this.channel.send({
        content:
          "🧪 Bot connection test - this message confirms the bot can send announcements",
      });

      this.logger.info("Test message sent successfully");
      return true;
    } catch (error) {
      this.logger.error("Test message failed", error);
      return false;
    }
  }

  // Reset the service (useful for reconnection scenarios)
  reset(): void {
    this.isReady = false;
    this.channel = null;
    this.messageQueue = [];
    this.processingQueue = false;

    this.logger.info("Announcement service reset");
  }

  // Create a leaderboard embed for manual commands
  createLeaderboardEmbed(leaderboard: DailyLeaderboard) {
    return this.leaderboardFormatter.createLeaderboardEmbed(leaderboard);
  }
}
