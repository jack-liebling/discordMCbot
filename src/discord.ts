// T011: Discord message formatter creating death announcement embeds
import { EmbedBuilder, ColorResolvable } from "discord.js";
import { DeathEvent, IStorageService } from "./types";
import { Logger } from "./logger";
import { TimezoneUtils } from "./timezoneUtils";
import { SessionTracker } from "./sessionTracker";

export class DiscordFormatter {
  private readonly logger = Logger.getInstance();
  private readonly serverName: string;
  private readonly sessionTracker: SessionTracker;

  constructor(serverName: string, storageService: IStorageService) {
    this.serverName = serverName;
    this.sessionTracker = new SessionTracker(storageService);
  }

  async createDeathAnnouncementEmbed(
    deathEvent: DeathEvent,
    totalDeaths: number,
    previousDeathTimestamp?: string | null,
    lastLifeDurationMs?: number
  ): Promise<EmbedBuilder> {
    // Use the pre-calculated last life duration from the database
    let onlineTimeSinceLastDeath: string;
    if (lastLifeDurationMs !== undefined) {
      if (lastLifeDurationMs > 0) {
        // Use the stored last life duration value (works for both first and subsequent deaths)
        onlineTimeSinceLastDeath =
          this.sessionTracker.formatLastLifeDuration(lastLifeDurationMs);
      } else {
        // Edge case: no meaningful duration calculated
        onlineTimeSinceLastDeath = "No time alive";
      }
    } else {
      // This should not happen in normal operation since we always calculate lastLifeDurationMs
      this.logger.error(
        "No lastLifeDurationMs provided for death announcement",
        {
          username: deathEvent.username,
          totalDeaths,
          previousDeathTimestamp,
        }
      );
      onlineTimeSinceLastDeath = "Duration unavailable";
    }

    const embed = new EmbedBuilder()
      .setTitle("💀 Player Death Alert")
      .setDescription(`${deathEvent.username} ${deathEvent.cause}`)
      .setColor(0xff0000 as ColorResolvable) // Red color
      .addFields(
        {
          name: "Time of Death",
          value: this.formatTimestamp(deathEvent.timestamp),
          inline: true,
        },
        {
          name: "Survived For",
          value: onlineTimeSinceLastDeath,
          inline: true,
        },
        {
          name: "Total Deaths",
          value: `Death #${totalDeaths}`,
          inline: true,
        }
      );

    // Add PvP kill information if applicable
    if (deathEvent.killerUsername) {
      embed.addFields({
        name: "🗡️ Killed By",
        value: `${deathEvent.killerUsername} (received death reduction reward)`,
        inline: false,
      });
      embed.setColor(0xffa500 as ColorResolvable); // Orange color for PvP deaths
    }

    embed
      .setFooter({ text: this.serverName })
      .setTimestamp(deathEvent.timestamp);

    this.logger.debug("Created death announcement embed", {
      player: deathEvent.username,
      cause: deathEvent.cause,
      totalDeaths,
      onlineTimeSinceLastDeath,
    });

    return embed;
  }

  createConnectionErrorEmbed(errorMessage: string): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle("⚠️ Connection Issue")
      .setDescription(errorMessage)
      .setColor(0xffff00 as ColorResolvable) // Yellow color
      .setFooter({ text: "Bot will retry automatically" })
      .setTimestamp();

    this.logger.debug("Created connection error embed", { errorMessage });

    return embed;
  }

  createRateLimitMessage(username: string): string {
    const message = `⏱️ ${username} died again too quickly - announcement skipped`;
    this.logger.debug("Created rate limit message", { username });
    return message;
  }

  createStartupMessage(): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle("🤖 Bot Online")
      .setDescription(`Monitoring ${this.serverName} for player deaths`)
      .setColor(0x00ff00 as ColorResolvable) // Green color
      .setTimestamp();

    this.logger.debug("Created startup message embed");

    return embed;
  }

  createShutdownMessage(): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle("🤖 Bot Offline")
      .setDescription(`No longer monitoring ${this.serverName}`)
      .setColor(0xff8000 as ColorResolvable) // Orange color
      .setTimestamp();

    this.logger.debug("Created shutdown message embed");

    return embed;
  }

  private formatTimestamp(timestamp: Date): string {
    // Use the timezone utility to properly convert to New York time
    return TimezoneUtils.formatAsNewYorkTime(timestamp, "short");
  }

  private formatTimeSinceLastDeath(
    previousDeathTimestamp: string | null | undefined,
    currentDeathTimestamp: Date
  ): string {
    if (!previousDeathTimestamp) {
      return "First death";
    }

    // Use the timezone utility for consistent time difference calculation
    return TimezoneUtils.formatTimeDifference(
      new Date(previousDeathTimestamp),
      currentDeathTimestamp,
      true // Use New York time for the calculation
    );
  }

  // Utility method to sanitize death causes for Discord
  sanitizeDeathCause(cause: string): string {
    // Remove any potential Discord markdown or mentions
    return cause
      .replace(/[`*_~|]/g, "") // Remove markdown characters
      .replace(/@(everyone|here)/g, "@\u200b$1") // Break @everyone/@here
      .trim();
  }

  // Method to truncate long player names for Discord limits
  truncatePlayerName(playerName: string, maxLength: number = 16): string {
    if (playerName.length <= maxLength) {
      return playerName;
    }
    return playerName.substring(0, maxLength - 3) + "...";
  }

  // Method to validate embed content doesn't exceed Discord limits
  validateEmbed(embed: EmbedBuilder): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check title length (max 256 characters)
    const title = embed.data.title;
    if (title && title.length > 256) {
      errors.push("Title exceeds 256 character limit");
    }

    // Check description length (max 4096 characters)
    const description = embed.data.description;
    if (description && description.length > 4096) {
      errors.push("Description exceeds 4096 character limit");
    }

    // Check field values (max 1024 characters each)
    if (embed.data.fields) {
      embed.data.fields.forEach((field, index) => {
        if (field.value && field.value.length > 1024) {
          errors.push(`Field ${index + 1} value exceeds 1024 character limit`);
        }
        if (field.name && field.name.length > 256) {
          errors.push(`Field ${index + 1} name exceeds 256 character limit`);
        }
      });
    }

    // Check footer text length (max 2048 characters)
    if (embed.data.footer?.text && embed.data.footer.text.length > 2048) {
      errors.push("Footer text exceeds 2048 character limit");
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Create a player join announcement embed
   */
  createJoinAnnouncementEmbed(
    username: string,
    timestamp: Date,
    craftersRoleId: string
  ): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle("🟢 Player Joined")
      .setDescription(
        `<@&${craftersRoleId}> ${username} has joined the server!`
      )
      .setColor(0x00ff00 as ColorResolvable) // Green color
      .addFields({
        name: "Join Time",
        value: this.formatTimestamp(timestamp),
        inline: true,
      })
      .setFooter({ text: this.serverName })
      .setTimestamp(timestamp);

    this.logger.debug("Created join announcement embed", {
      player: username,
    });

    return embed;
  }

  /**
   * Create a player leave announcement embed (for logging purposes)
   */
  createLeaveAnnouncementEmbed(
    username: string,
    timestamp: Date
  ): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle("🔴 Player Left")
      .setDescription(`${username} has left the server`)
      .setColor(0xff6600 as ColorResolvable) // Orange color
      .addFields({
        name: "Leave Time",
        value: this.formatTimestamp(timestamp),
        inline: true,
      })
      .setFooter({ text: this.serverName })
      .setTimestamp(timestamp);

    this.logger.debug("Created leave announcement embed", {
      player: username,
    });

    return embed;
  }
}
