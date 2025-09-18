// T011: Discord message formatter creating death announcement embeds
import { EmbedBuilder, ColorResolvable } from "discord.js";
import { DeathEvent, SessionEvent } from "./types";
import { Logger } from "./logger";

export class DiscordFormatter {
  private readonly logger = Logger.getInstance();
  private readonly serverName: string;
  private readonly timezone: string;

  constructor(serverName: string, timezone: string = "America/New_York") {
    this.serverName = serverName;
    this.timezone = timezone;
  }

  createDeathAnnouncementEmbed(
    deathEvent: DeathEvent,
    totalDeaths: number,
    previousDeathTimestamp?: string | null
  ): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle("💀 Player Death Alert")
      .setDescription(`${deathEvent.playerId} ${deathEvent.cause}`)
      .setColor(0xff0000 as ColorResolvable) // Red color
      .addFields(
        {
          name: "Time of Death",
          value: this.formatTimestamp(deathEvent.timestamp),
          inline: true,
        },
        {
          name: "Time Since Last Death",
          value: this.formatTimeSinceLastDeath(
            previousDeathTimestamp,
            deathEvent.timestamp
          ),
          inline: true,
        },
        {
          name: "Total Deaths",
          value: `Death #${totalDeaths}`,
          inline: true,
        }
      )
      .setFooter({ text: this.serverName })
      .setTimestamp(deathEvent.timestamp);

    this.logger.debug("Created death announcement embed", {
      player: deathEvent.playerId,
      cause: deathEvent.cause,
      totalDeaths,
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

  createSessionJoinEmbed(sessionEvent: SessionEvent): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle("🟢 Player Joined")
      .setDescription(`**${sessionEvent.username}** joined the server`)
      .setColor(0x00ff00 as ColorResolvable) // Green color
      .addFields({
        name: "Join Time",
        value: this.formatTimestamp(sessionEvent.timestamp),
        inline: true,
      })
      .setFooter({ text: `${this.serverName} • Welcome!` })
      .setTimestamp(sessionEvent.timestamp);

    this.logger.debug("Created session join embed", {
      username: sessionEvent.username,
      timestamp: sessionEvent.timestamp,
    });

    return embed;
  }

  createSessionNotificationText(
    sessionEvent: SessionEvent,
    roleId: string
  ): string {
    const roleTag = `<@&${roleId}>`;
    const playerName = this.truncatePlayerName(sessionEvent.username);

    return `${roleTag} **${playerName}** joined the server!`;
  }

  private formatTimestamp(timestamp: Date): string {
    // Use the configured timezone for proper EDT/EST handling
    const options: Intl.DateTimeFormatOptions = {
      timeZone: this.timezone,
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    };

    return timestamp.toLocaleDateString("en-US", options);
  }

  private formatTimeSinceLastDeath(
    previousDeathTimestamp: string | null | undefined,
    currentDeathTimestamp: Date
  ): string {
    if (!previousDeathTimestamp) {
      return "First death";
    }

    const timeDiffMs =
      currentDeathTimestamp.getTime() -
      new Date(previousDeathTimestamp).getTime();
    const timeDiffSeconds = Math.floor(timeDiffMs / 1000);

    // Less than a minute
    if (timeDiffSeconds < 60) {
      return `${timeDiffSeconds} seconds ago`;
    }

    // Less than an hour
    const minutes = Math.floor(timeDiffSeconds / 60);
    if (minutes < 60) {
      return `${minutes} minute${minutes !== 1 ? "s" : ""} ago`;
    }

    // Less than a day
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      const remainingMinutes = minutes % 60;
      if (remainingMinutes > 0) {
        return `${hours}h ${remainingMinutes}m ago`;
      }
      const hourText = hours !== 1 ? "hours" : "hour";
      return `${hours} ${hourText} ago`;
    }

    // Days
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    if (remainingHours > 0) {
      return `${days}d ${remainingHours}h ago`;
    }
    const dayText = days !== 1 ? "days" : "day";
    return `${days} ${dayText} ago`;
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
}
