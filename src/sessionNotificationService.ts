// SessionNotificationService - coordinates session notifications between log parser, database, and Discord
import {
  SessionEvent,
  NotificationRecord,
  SessionNotificationData,
} from "./types";
import { DatabaseService } from "./database";
import { DiscordFormatter } from "./discord";
import { Logger } from "./logger";
import { TextChannel, Client } from "discord.js";

export class SessionNotificationService {
  private readonly logger = Logger.getInstance();
  private readonly database: DatabaseService;
  private readonly discordFormatter: DiscordFormatter;
  private readonly discordClient: Client;
  private readonly config: {
    enabled: boolean;
    craftersRoleId: string;
    whoIsOnChannelId: string;
    cooldownSeconds: number;
    deletionDelayMs: number;
  };
  private readonly deletionTimeouts = new Map<string, NodeJS.Timeout>();

  constructor(
    database: DatabaseService,
    discordFormatter: DiscordFormatter,
    discordClient: Client,
    config: {
      enabled: boolean;
      craftersRoleId: string;
      whoIsOnChannelId: string;
      cooldownSeconds: number;
      deletionDelayMs: number;
    }
  ) {
    this.database = database;
    this.discordFormatter = discordFormatter;
    this.discordClient = discordClient;
    this.config = config;

    this.logger.debug("SessionNotificationService initialized", {
      enabled: config.enabled,
      craftersRoleId: config.craftersRoleId,
      whoIsOnChannelId: config.whoIsOnChannelId,
    });

    // Note: Discord bot requires the following permissions in the target channel:
    // - Send Messages
    // - Manage Messages (for deleting own messages)
    // - Use External Emojis
    // - Embed Links
    // - Mention Everyone (for @role mentions)
  }

  /**
   * Initialize the service and restore pending deletions from database
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      this.logger.info(
        "Session notifications disabled - skipping initialization"
      );
      return;
    }

    try {
      // First, clean up any expired notifications
      const cleanedCount = await this.database.cleanupExpiredNotifications();
      if (cleanedCount > 0) {
        this.logger.info(
          `Cleaned up ${cleanedCount} expired notifications on startup`
        );
      }

      // Restore pending deletions
      const pendingDeletions = await this.database.getPendingDeletions();

      // Process deletions and count in single pass
      let restoredTimeouts = 0;
      let overdueDeleted = 0;

      for (const deletion of pendingDeletions) {
        if (deletion.remainingMs > 1000) {
          restoredTimeouts++;
          // Use 1 second threshold to avoid immediate execution
          // Schedule the timeout
          const timeoutId = setTimeout(async () => {
            try {
              const notification =
                await this.database.findActiveJoinNotification(
                  deletion.username,
                  this.config.whoIsOnChannelId
                );

              if (notification) {
                await this.deleteNotificationMessage(notification);
              }
            } catch (error) {
              this.logger.error("Failed to execute restored deletion timeout", {
                error,
                username: deletion.username,
                messageId: deletion.discordMessageId,
              });
            }

            this.deletionTimeouts.delete(
              `${deletion.username}-${deletion.discordMessageId}`
            );
          }, deletion.remainingMs);

          // Store timeout reference
          this.deletionTimeouts.set(
            `${deletion.username}-${deletion.discordMessageId}`,
            timeoutId
          );

          this.logger.info("Restored deletion timeout", {
            username: deletion.username,
            messageId: deletion.discordMessageId,
            remainingSeconds: Math.ceil(deletion.remainingMs / 1000),
          });
        } else {
          overdueDeleted++;
          // Already expired, delete immediately
          try {
            const notification = await this.database.findActiveJoinNotification(
              deletion.username,
              this.config.whoIsOnChannelId
            );

            if (notification) {
              await this.deleteNotificationMessage(notification);
              this.logger.info("Deleted overdue notification on startup", {
                username: deletion.username,
                messageId: deletion.discordMessageId,
              });
            }
          } catch (error) {
            this.logger.error(
              "Failed to delete overdue notification on startup",
              {
                error,
                username: deletion.username,
                messageId: deletion.discordMessageId,
              }
            );
          }
        }
      }

      this.logger.info("SessionNotificationService initialization complete", {
        restoredTimeouts,
        overdueDeleted,
      });
    } catch (error) {
      this.logger.error("Failed to initialize SessionNotificationService", {
        error,
      });
      throw error;
    }
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

    // Always update the player's online status first
    await this.database.updatePlayerSessionState(
      username,
      true,
      sessionEvent.timestamp
    );

    // First, check if there's an existing notification with pending deletion
    const existingNotification = await this.database.findActiveJoinNotification(
      username,
      this.config.whoIsOnChannelId
    );

    if (existingNotification?.discordMessageId) {
      // Cancel any pending deletion timeout in memory
      const timeoutKey = `${username}-${existingNotification.discordMessageId}`;
      const existingTimeout = this.deletionTimeouts.get(timeoutKey);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
        this.deletionTimeouts.delete(timeoutKey);
        this.logger.debug(
          "Cancelled pending deletion timeout for existing notification",
          {
            username,
            messageId: existingNotification.discordMessageId,
          }
        );
      }

      // Cancel scheduled deletion in database
      await this.database.cancelScheduledDeletion(username);

      // Update existing notification expiration time to extend its lifecycle
      await this.database.recordSessionNotification({
        username,
        type: "JOIN",
        discordMessageId: existingNotification.discordMessageId,
        discordChannelId: discordChannel.id,
        discordGuildId: discordChannel.guild.id,
        expiresAt: new Date(Date.now() + this.config.deletionDelayMs),
        timestamp: sessionEvent.timestamp, // Use actual event timestamp
      });

      this.logger.info("User rejoined - existing notification preserved", {
        username,
        messageId: existingNotification.discordMessageId,
      });
      return;
    }

    // Check if user is in cooldown period for new notifications
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

    // Create and send new JOIN notification
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
        expiresAt: new Date(Date.now() + this.config.deletionDelayMs), // Configurable deletion delay
        timestamp: sessionEvent.timestamp, // Use actual event timestamp from logs
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

    // Always update the player's online status first
    await this.database.updatePlayerSessionState(
      username,
      false,
      sessionEvent.timestamp
    );

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

    // Calculate deletion time
    const deletionTime = new Date(Date.now() + this.config.deletionDelayMs);

    // Store deletion schedule in database for persistence across restarts
    await this.database.scheduleNotificationDeletion(username, deletionTime);

    // Schedule deletion timeout in memory
    const deletionDelay = this.config.deletionDelayMs;
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

    this.logger.info(
      "Player marked as offline and scheduled JOIN notification deletion",
      {
        username,
        messageId: activeNotification.discordMessageId,
        deletionDelayMs: deletionDelay,
        deleteAt: deletionTime.toISOString(),
      }
    );
  }

  /**
   * Delete a notification message from Discord and mark as deleted in database
   */
  private async deleteNotificationMessage(
    notification: NotificationRecord
  ): Promise<void> {
    if (!notification.discordMessageId) {
      this.logger.warn(
        "No discordMessageId found for notification, skipping deletion",
        {
          username: notification.username,
        }
      );
      return;
    }

    try {
      // Fetch the Discord channel
      const channel = await this.discordClient.channels.fetch(
        notification.discordChannelId || this.config.whoIsOnChannelId
      );

      if (!channel?.isTextBased()) {
        this.logger.error("Channel not found or not text-based", {
          channelId:
            notification.discordChannelId || this.config.whoIsOnChannelId,
          messageId: notification.discordMessageId,
        });
        return;
      }

      // Delete the message from Discord
      try {
        const message = await channel.messages.fetch(
          notification.discordMessageId
        );
        await message.delete();

        this.logger.info("Discord message deleted successfully", {
          username: notification.username,
          messageId: notification.discordMessageId,
          channelId: channel.id,
        });
      } catch (messageError) {
        // Message might already be deleted or not found
        this.logger.warn(
          "Could not delete Discord message (may already be deleted)",
          {
            error: messageError,
            messageId: notification.discordMessageId,
            username: notification.username,
          }
        );
      }

      // Mark as deleted in database regardless of Discord deletion success
      await this.database.markNotificationDeleted(
        notification.discordMessageId
      );

      this.logger.info("Notification marked as deleted in database", {
        username: notification.username,
        messageId: notification.discordMessageId,
      });
    } catch (error) {
      this.logger.error("Failed to delete notification message", {
        error,
        messageId: notification.discordMessageId,
        username: notification.username,
      });

      // Still mark as deleted in database to prevent retries
      try {
        await this.database.markNotificationDeleted(
          notification.discordMessageId
        );
      } catch (dbError) {
        this.logger.error(
          "Failed to mark notification as deleted in database",
          {
            error: dbError,
            messageId: notification.discordMessageId,
          }
        );
      }
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
      deletionDelayMs: number;
    };
  } {
    return {
      enabled: this.config.enabled,
      activeTimeouts: this.deletionTimeouts.size,
      config: this.config,
    };
  }
}
