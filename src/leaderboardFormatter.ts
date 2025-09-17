// LeaderboardFormatter - Discord embed formatting for leaderboards
import { EmbedBuilder } from "discord.js";
import { DailyLeaderboard } from "./types";

export class LeaderboardFormatter {
  /**
   * Create Discord embed for daily leaderboard
   */
  createLeaderboardEmbed(leaderboard: DailyLeaderboard): EmbedBuilder {
    try {
      if (leaderboard.totalPlayers === 0) {
        return this.createEmptyLeaderboardEmbed();
      }

      const embed = new EmbedBuilder()
        .setTitle("🏆 Daily Death Leaderboard")
        .setDescription("Death counts for all tracked players")
        .setColor(0x8b4513) // Saddle brown color for death theme
        .setTimestamp(leaderboard.generatedAt)
        .setFooter({
          text: `Generated for ${leaderboard.totalPlayers} players • Updated daily at 9:00 AM EST`,
        });

      // Generate rankings field
      const rankingsText = this.formatRankings(leaderboard.leaderboard);
      embed.addFields({
        name: "📊 Rankings",
        value: rankingsText,
        inline: false,
      });

      // Add survival champion field if available
      if (leaderboard.survivalChampion) {
        const championText = this.formatSurvivalChampion(
          leaderboard.survivalChampion
        );
        embed.addFields({
          name: "🛡️ Survival Champion",
          value: championText,
          inline: false,
        });
      } else {
        embed.addFields({
          name: "🛡️ Survival Champion",
          value: "No active players (all inactive for >7 days)",
          inline: false,
        });
      }

      return embed;
    } catch (error) {
      console.error("Failed to create leaderboard embed:", error);
      return this.createErrorEmbed();
    }
  }

  /**
   * Format survival time duration into human-readable string
   */
  formatSurvivalTime(timeAliveMs: number): string {
    if (timeAliveMs <= 0) {
      return "just died";
    }

    if (timeAliveMs < 60000) {
      // Less than 1 minute
      return "less than 1 minute";
    }

    const minutes = Math.floor(timeAliveMs / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return this.formatDaysText(days, hours % 24);
    }

    if (hours > 0) {
      return this.formatHoursText(hours, minutes % 60);
    }

    return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
  }

  private formatDaysText(days: number, remainingHours: number): string {
    const dayText = `${days} day${days !== 1 ? "s" : ""}`;
    if (remainingHours > 0) {
      return `${dayText}, ${remainingHours} hour${
        remainingHours !== 1 ? "s" : ""
      }`;
    }
    return dayText;
  }

  private formatHoursText(hours: number, remainingMinutes: number): string {
    const hourText = `${hours} hour${hours !== 1 ? "s" : ""}`;
    if (remainingMinutes > 0) {
      return `${hourText}, ${remainingMinutes} minute${
        remainingMinutes !== 1 ? "s" : ""
      }`;
    }
    return hourText;
  }

  /**
   * Create embed for when no deaths are recorded
   */
  createEmptyLeaderboardEmbed(): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle("🏆 Daily Death Leaderboard")
      .setDescription("No deaths recorded yet - everyone is surviving! 🎉")
      .setColor(0x90ee90) // Light green for no deaths
      .setTimestamp()
      .setFooter({
        text: "Updated daily at 9:00 AM EST",
      });
  }

  /**
   * Format leaderboard rankings with emojis based on death count
   */
  private formatRankings(entries: any[]): string {
    const lines = [];

    for (const entry of entries) {
      const emoji = this.getDeathEmoji(entry.totalDeaths);
      const deathText = entry.totalDeaths === 1 ? "death" : "deaths";

      if (entry.isActive) {
        lines.push(
          `${entry.rank}. ${entry.username} - ${entry.totalDeaths} ${deathText} ${emoji}`
        );
      } else {
        // Show inactive players at the end with different formatting
        lines.push(
          `   (inactive: ${entry.username} - ${entry.totalDeaths} ${deathText})`
        );
      }
    }

    // Ensure content doesn't exceed Discord limits (1024 chars for field value)
    const result = lines.join("\n");
    if (result.length > 1000) {
      const truncated = lines.slice(0, Math.floor(lines.length / 2));
      const remaining = entries.length - truncated.length;
      truncated.push(`...and ${remaining} more players`);
      return truncated.join("\n");
    }

    return result || "No players to display";
  }

  /**
   * Format survival champion information
   */
  private formatSurvivalChampion(champion: any): string {
    const timeAlive = this.formatSurvivalTime(champion.timeAliveMs);
    const lastDeathText = champion.lastDeathTimestamp
      ? this.formatDate(new Date(champion.lastDeathTimestamp))
      : "Never (perfect record!)";

    return `🥇 ${champion.username} has survived for **${timeAlive}**\nLast death: ${lastDeathText}`;
  }

  /**
   * Get emoji based on death count
   */
  private getDeathEmoji(deathCount: number): string {
    if (deathCount >= 50) return "☠️"; // Skull and crossbones for absolute chaos
    if (deathCount >= 30) return "💀"; // Skull for excessive deaths
    if (deathCount >= 20) return "🧨"; // Dynamite for explosive deaths
    if (deathCount >= 15) return "⚡"; // Lightning for frequent deaths
    if (deathCount >= 10) return "🔥"; // Fire for many deaths
    if (deathCount >= 7) return "🤕"; // Bandaged face for getting hurt often
    if (deathCount >= 5) return "😵"; // Dizzy face for moderate deaths
    if (deathCount >= 3) return "�"; // Grimacing face for some deaths
    if (deathCount >= 1) return "👶"; // Baby for first deaths (everyone starts somewhere)
    return "😇"; // Angel for the pure soul with no deaths
  }

  /**
   * Format date for display
   */
  private formatDate(date: Date): string {
    const options: Intl.DateTimeFormatOptions = {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    };
    return date.toLocaleString("en-US", options);
  }

  /**
   * Create error embed when something goes wrong
   */
  private createErrorEmbed(): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle("🏆 Daily Death Leaderboard")
      .setDescription(
        "⚠️ Error generating leaderboard - please try again later"
      )
      .setColor(0xff0000) // Red for error
      .setTimestamp()
      .setFooter({
        text: "Updated daily at 9:00 AM EST",
      });
  }
}
