// Activity Parser Utilities for Enhanced Minecraft Log Processing
// Provides specialized metadata extraction and validation for various player activities

import { Logger } from "./logger";
import {
  JoinMetadata,
  LeaveMetadata,
  ChatMetadata,
  AchievementMetadata,
  DeathMetadata,
} from "./types";

export class ActivityParser {
  private static readonly logger = Logger.getInstance();

  /**
   * Parse coordinates from various coordinate string formats
   * Handles formats like: "overworld 123.45, 64.0, -456.78", "[world] 123, 64, 456"
   */
  static parseCoordinates(
    coordinateString: string
  ): { x: number; y: number; z: number } | undefined {
    if (!coordinateString) return undefined;

    // Pattern for coordinates with optional world/dimension prefix
    const patterns = [
      // "overworld 123.45, 64.0, -456.78" or "123.45, 64.0, -456.78"
      /(?:[\w\[\]]+\s+)?([+-]?\d+\.?\d*),?\s*([+-]?\d+\.?\d*),?\s*([+-]?\d+\.?\d*)/,
      // "x=123 y=64 z=456" format
      /x=([+-]?\d+\.?\d*)\s*y=([+-]?\d+\.?\d*)\s*z=([+-]?\d+\.?\d*)/i,
      // "(123, 64, 456)" format
      /\(([+-]?\d+\.?\d*),?\s*([+-]?\d+\.?\d*),?\s*([+-]?\d+\.?\d*)\)/,
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(coordinateString);
      if (match) {
        const x = parseFloat(match[1]);
        const y = parseFloat(match[2]);
        const z = parseFloat(match[3]);

        // Validate coordinates are within reasonable Minecraft bounds
        if (this.areValidCoordinates(x, y, z)) {
          return { x, y, z };
        }
      }
    }

    this.logger.warn(`Failed to parse coordinates: ${coordinateString}`);
    return undefined;
  }

  /**
   * Extract dimension from coordinate string or log context
   */
  static parseDimension(logLine: string): string | undefined {
    const dimensionPatterns = [
      /\[(overworld|the_nether|the_end)\]/i,
      /(?:in|to)\s+(overworld|nether|end|the_nether|the_end)/i,
      /dimension[:\s]+([a-z_]+)/i,
    ];

    for (const pattern of dimensionPatterns) {
      const match = pattern.exec(logLine);
      if (match) {
        return this.normalizeDimension(match[1]);
      }
    }

    return undefined;
  }

  /**
   * Parse IP address from login details
   */
  static parseIpAddress(logLine: string): string | undefined {
    // Pattern for IP address extraction: "Player[/192.168.1.100:12345]"
    const ipPattern = /\[\/([0-9.:]+)(?::\d+)?\]/;
    const match = ipPattern.exec(logLine);

    if (match) {
      const ip = match[1];
      // Basic validation for IPv4
      if (this.isValidIpAddress(ip)) {
        return ip;
      }
    }

    return undefined;
  }

  /**
   * Extract entity ID from login messages
   */
  static parseEntityId(logLine: string): number | undefined {
    const entityPattern = /entity\s+id\s+(\d+)/i;
    const match = entityPattern.exec(logLine);

    if (match) {
      const entityId = parseInt(match[1], 10);
      if (!isNaN(entityId) && entityId > 0) {
        return entityId;
      }
    }

    return undefined;
  }

  /**
   * Parse disconnect reason from leave messages
   */
  static parseDisconnectReason(logLine: string): string | undefined {
    const reasonPatterns = [
      /lost connection:\s*(.+)$/i,
      /disconnected:\s*(.+)$/i,
      /kicked:\s*(.+)$/i,
      /timed out:\s*(.+)$/i,
    ];

    for (const pattern of reasonPatterns) {
      const match = pattern.exec(logLine);
      if (match) {
        return match[1].trim();
      }
    }

    return undefined;
  }

  /**
   * Categorize achievements into logical groups
   */
  static categorizeAchievement(achievementName: string): string {
    if (!achievementName) return "Unknown";

    const name = achievementName.toLowerCase();
    const categories = {
      Nether: ["nether", "blaze", "wither", "ghast", "piglin", "netherite"],
      End: ["end", "dragon", "ender", "elytra", "shulker", "chorus"],
      Mining: [
        "mine",
        "ore",
        "diamond",
        "iron",
        "gold",
        "coal",
        "cave",
        "stone",
      ],
      Adventure: [
        "adventure",
        "explore",
        "village",
        "raid",
        "monument",
        "mansion",
      ],
      Farming: ["breed", "farm", "crop", "animal", "wheat", "carrot", "potato"],
      Combat: [
        "monster",
        "skeleton",
        "zombie",
        "spider",
        "creeper",
        "kill",
        "fight",
      ],
      Redstone: ["redstone", "piston", "circuit", "automation", "dispenser"],
      Building: ["build", "construct", "beacon", "house", "tower"],
      Exploration: ["biome", "structure", "temple", "shipwreck", "ruins"],
    };

    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some((keyword) => name.includes(keyword))) {
        return category;
      }
    }

    return "General";
  }

  /**
   * Analyze chat message for additional metadata
   */
  static analyzeChatMessage(message: string): Partial<ChatMetadata> {
    if (!message) return {};

    const metadata: Partial<ChatMetadata> = {
      message_length: message.length,
    };

    // Check for mentions (@username)
    if (/@\w+/.test(message)) {
      metadata.contains_mention = true;
    }

    // Detect if this might be a command (starts with /)
    if (message.startsWith("/")) {
      metadata.thread_info = "command";
    }

    // Check for URLs
    if (/https?:\/\/\S+/.test(message)) {
      metadata.thread_info = "contains_url";
    }

    return metadata;
  }

  /**
   * Validate if all three coordinates are within reasonable Minecraft bounds
   */
  private static areValidCoordinates(x: number, y: number, z: number): boolean {
    return (
      !isNaN(x) &&
      x >= -30000000 &&
      x <= 30000000 &&
      !isNaN(y) &&
      y >= -30000000 &&
      y <= 30000000 &&
      !isNaN(z) &&
      z >= -30000000 &&
      z <= 30000000
    );
  }

  /**
   * Validate if a coordinate is within reasonable Minecraft bounds
   */
  private static isValidCoordinate(coord: number): boolean {
    return !isNaN(coord) && coord >= -30000000 && coord <= 30000000;
  }

  /**
   * Normalize dimension names to standard format
   */
  private static normalizeDimension(dimension: string): string {
    const normalized = dimension.toLowerCase();

    switch (normalized) {
      case "overworld":
      case "the_overworld":
        return "Overworld";
      case "nether":
      case "the_nether":
        return "Nether";
      case "end":
      case "the_end":
        return "End";
      default:
        return dimension;
    }
  }

  /**
   * Basic IPv4 address validation
   */
  private static isValidIpAddress(ip: string): boolean {
    const ipPattern =
      /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipPattern.test(ip);
  }

  /**
   * Enhanced join metadata extraction
   */
  static extractJoinMetadata(logLine: string): JoinMetadata {
    const metadata: JoinMetadata = {};

    // Parse coordinates
    const coordinates = this.parseCoordinates(logLine);
    if (coordinates) {
      metadata.coordinates = coordinates;
    }

    // Parse dimension
    const dimension = this.parseDimension(logLine);
    if (dimension) {
      metadata.dimension = dimension;
    }

    // Parse IP address
    const ipAddress = this.parseIpAddress(logLine);
    if (ipAddress) {
      metadata.ip_address = ipAddress;
    }

    // Parse entity ID
    const entityId = this.parseEntityId(logLine);
    if (entityId) {
      metadata.entity_id = entityId;
    }

    return metadata;
  }

  /**
   * Enhanced leave metadata extraction
   */
  static extractLeaveMetadata(logLine: string): LeaveMetadata {
    const metadata: LeaveMetadata = {};

    // Parse disconnect reason
    const reason = this.parseDisconnectReason(logLine);
    if (reason) {
      metadata.reason = reason;
    }

    // Note: duration_ms would be calculated by correlating with JOIN events
    // This would be handled by the session tracking system

    return metadata;
  }

  /**
   * Enhanced chat metadata extraction
   */
  static extractChatMetadata(message: string): ChatMetadata {
    const basicMetadata = this.analyzeChatMessage(message);

    return {
      message_length: basicMetadata.message_length || 0,
      contains_mention: basicMetadata.contains_mention,
      thread_info: basicMetadata.thread_info,
    };
  }

  /**
   * Enhanced achievement metadata extraction
   */
  static extractAchievementMetadata(
    achievementName: string,
    logLine: string
  ): AchievementMetadata {
    return {
      advancement_name: achievementName,
      advancement_category: this.categorizeAchievement(achievementName),
      // is_first_time could be determined by checking if player already has this achievement
      is_first_time: undefined,
    };
  }

  /**
   * Enhanced death metadata extraction
   */
  static extractDeathMetadata(
    cause: string,
    experienceLevel?: number
  ): DeathMetadata {
    return {
      cause,
      experience_level: experienceLevel,
    };
  }
}
