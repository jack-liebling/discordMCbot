// SessionNotificationService - coordinates session notifications between log parser, database, and Discord
import {
  SessionEvent,
  NotificationRecord,
  SessionNotificationData,
} from "./types";
import { DatabaseService } from "./database";
import { DiscordFormatter } from "./discord";
import { Logger } from "./logger";
import { TextChannel } from "discord.js";

export class SessionNotificationService {
  private readonly logger = Logger.getInstance();
  private readonly database: DatabaseService;
  private readonly discordFormatter: DiscordFormatter;
  private readonly config: {
    enabled: boolean;
    craftersRoleId: string;
    whoIsOnChannelId: string;
    cooldownSeconds: number;
  };
  private readonly deletionTimeouts = new Map<string, NodeJS.Timeout>();

  constructor(
    database: DatabaseService,
    discordFormatter: DiscordFormatter,
    config: {
      enabled: boolean;
      craftersRoleId: string;
      whoIsOnChannelId: string;
      cooldownSeconds: number;
    }
  ) {
    this.database = database;
    this.discordFormatter = discordFormatter;
    this.config = config;

    this.logger.debug("SessionNotificationService initialized", {
      enabled: config.enabled,
      craftersRoleId: config.craftersRoleId,
      whoIsOnChannelId: config.whoIsOnChannelId,
    });
  }

  /**
   * Handle a session event from the log parser
   */
  async handleSessionEvent(
    sessionEvent: SessionEvent,
    discordChannel: TextChannel
  ): Promise<void> {
    if (!this.config.enabled) {
      this.logger.debug("Session notifications disabled, skipping event", {
        username: sessionEvent.username,
        type: sessionEvent.type,
      });
      return;
    }

    try {
      switch (sessionEvent.type) {
        case "JOIN":
          await this.handleJoinEvent(sessionEvent, discordChannel);
          break;
        case "LEAVE":
          await this.handleLeaveEvent(sessionEvent);
          break;
        default:
          this.logger.warn("Unknown session event type", {
            type: sessionEvent.type,
            username: sessionEvent.username,
          });
      }
    } catch (error) {
      this.logger.error("Failed to handle session event", {
        error,
        username: sessionEvent.username,
        type: sessionEvent.type,
      });
    }
  }

  /**
   * Handle JOIN event - check cooldown and post notification if appropriate
   */
  private async handleJoinEvent(
    sessionEvent: SessionEvent,
    discordChannel: TextChannel
  ): Promise<void> {
    const { username } = sessionEvent;

    // Check if user is in cooldown period
    const cooldownStatus = await this.database.checkSessionCooldown(
      username,
      "JOIN"
    );

    if (cooldownStatus.inCooldown) {
      this.logger.debug("User in cooldown, skipping JOIN notification", {
        username,
        remainingSeconds: cooldownStatus.remainingSeconds,
      });
      return;
    }

    // Create and send JOIN notification
    const embed = this.discordFormatter.createSessionJoinEmbed(sessionEvent);
    const content = this.discordFormatter.createSessionNotificationText(
      sessionEvent,
      this.config.craftersRoleId
    );

    try {
      const message = await discordChannel.send({
        content,
        embeds: [embed],
      });

      // Record the notification in database
      const notificationData: SessionNotificationData = {
        username,
        type: "JOIN",
        discordMessageId: message.id,
        discordChannelId: discordChannel.id,
        discordGuildId: discordChannel.guild.id,
        expiresAt: new Date(Date.now() + 2 * 60 * 1000), // 2 minutes from now
      };

      await this.database.recordSessionNotification(notificationData);

      // Update cooldown
      await this.database.updateSessionCooldown(username, "JOIN");

      this.logger.info("JOIN notification posted successfully", {
        username,
        messageId: message.id,
        channelId: discordChannel.id,
      });
    } catch (error) {
      this.logger.error("Failed to post JOIN notification", {
        error,
        username,
        channelId: discordChannel.id,
      });
    }
  }

  /**
   * Handle LEAVE event - schedule deletion of JOIN notification
   */
  private async handleLeaveEvent(sessionEvent: SessionEvent): Promise<void> {
    const { username } = sessionEvent;

    // Find active JOIN notification for this user
    const activeNotification = await this.database.findActiveJoinNotification(
      username,
      this.config.whoIsOnChannelId
    );

    if (!activeNotification) {
      this.logger.debug("No active JOIN notification found for LEAVE event", {
        username,
      });
      return;
    }

    // Schedule deletion after 2 minutes
    const deletionDelay = 2 * 60 * 1000; // 2 minutes in milliseconds
    const timeoutId = setTimeout(async () => {
      await this.deleteNotificationMessage(activeNotification);
      this.deletionTimeouts.delete(
        `${username}-${activeNotification.discordMessageId}`
      );
    }, deletionDelay);

    // Store timeout reference
    this.deletionTimeouts.set(
      `${username}-${activeNotification.discordMessageId}`,
      timeoutId
    );

    this.logger.debug("Scheduled JOIN notification deletion", {
      username,
      messageId: activeNotification.discordMessageId,
      deletionDelayMs: deletionDelay,
    });
  }

  /**
   * Delete a notification message from Discord and mark as deleted in database
   */
  private async deleteNotificationMessage(
    notification: NotificationRecord
  ): Promise<void> {
    try {
      // Note: We'll need to pass the Discord client to delete messages
      // For now, we'll just mark as deleted in database
      if (notification.discordMessageId) {
        await this.database.markNotificationDeleted(
          notification.discordMessageId
        );

        this.logger.info("Notification marked for deletion", {
          username: notification.username,
          messageId: notification.discordMessageId,
        });
      } else {
        this.logger.warn(
          "No discordMessageId found for notification, skipping deletion",
          {
            username: notification.username,
          }
        );
      }
    } catch (error) {
      this.logger.error("Failed to delete notification message", {
        error,
        messageId: notification.discordMessageId,
        username: notification.username,
      });
    }
  }

  /**
   * Clean up scheduled deletion timeouts
   */
  cleanup(): void {
    for (const [key, timeoutId] of this.deletionTimeouts) {
      clearTimeout(timeoutId);
      this.logger.debug("Cleared deletion timeout", { key });
    }
    this.deletionTimeouts.clear();
    this.logger.debug("SessionNotificationService cleanup completed");
  }

  /**
   * Get status information for debugging
   */
  getStatus(): {
    enabled: boolean;
    activeTimeouts: number;
    config: {
      enabled: boolean;
      craftersRoleId: string;
      whoIsOnChannelId: string;
      cooldownSeconds: number;
    };
  } {
    return {
      enabled: this.config.enabled,
      activeTimeouts: this.deletionTimeouts.size,
      config: this.config,
    };
  }
}
