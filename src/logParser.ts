// Log parser service for reading Minecraft server logs via FTP
import FtpClient = require("ftp");
import {
  FtpConfig,
  DeathEvent,
  IStorageService,
  ActivityType,
  NewPlayerActivity,
} from "./types";
import { Logger } from "./logger";
import { ActivityParser } from "./activityParser";

export class LogParserService {
  private readonly logger = Logger.getInstance();
  private readonly ftpConfig: FtpConfig;
  private readonly storageService: IStorageService;
  private ftpClient: FtpClient | null = null;
  private lastLogPosition = 0;
  private intervalId: NodeJS.Timeout | null = null;
  private onDeathCallback: ((death: DeathEvent) => void) | null = null;

  // Activity detection patterns
  private static readonly ACTIVITY_PATTERNS = {
    // Player join detection
    JOIN: /\[(\d{2}:\d{2}:\d{2})\].*?\[Server thread\/INFO\]: (\w+) joined the game/,

    // Player leave detection
    LEAVE:
      /\[(\d{2}:\d{2}:\d{2})\].*?\[Server thread\/INFO\]: (\w+) left the game/,

    // Chat message detection
    CHAT: /\[(\d{2}:\d{2}:\d{2})\].*?\[Async Chat Thread.*?\]: <(\w+)> (.+)/,

    // Achievement detection
    ACHIEVEMENT:
      /\[(\d{2}:\d{2}:\d{2})\].*?\[Server thread\/INFO\]: (\w+) has made the advancement \[(.+)\]/,

    // Death detection (existing pattern enhanced)
    DEATH: /\[(\d{2}:\d{2}:\d{2})\].*?\[Server thread\/INFO\]: (\w+) (.+)/,
  };

  // Enhanced patterns for additional data extraction
  private static readonly ENHANCED_PATTERNS = {
    // Player login with coordinates
    LOGIN_DETAILS:
      /(\w+)\[\/([0-9.:]+)\] logged in with entity id (\d+) at \(\[([^\]]+)\]([^)]+)\)/,

    // UUID mapping
    UUID_MAPPING: /UUID of player (\w+) is ([a-f0-9-]+)/,

    // Disconnect reason
    DISCONNECT_REASON: /(\w+) lost connection: (.+)/,

    // Server status messages (for context)
    PLAYER_COUNT: /There are (\d+) of a max of (\d+) players online:?\s*(.*)/,
  };

  constructor(ftpConfig: FtpConfig, storageService: IStorageService) {
    this.ftpConfig = ftpConfig;
    this.storageService = storageService;
  }

  async connect(): Promise<void> {
    // Load saved log state to prevent re-processing old entries
    const logState = await this.storageService.getLogState();
    this.lastLogPosition = logState?.lastProcessedPosition ?? 0;
    this.logger.info(
      `Starting log monitoring from position: ${this.lastLogPosition}`
    );

    return new Promise((resolve, reject) => {
      this.ftpClient = new FtpClient();
      const client = this.ftpClient;

      client.on("ready", () => {
        this.logger.info(`FTP connected to ${this.ftpConfig.host}`);
        resolve();
      });

      client.on("error", (err: Error) => {
        this.logger.error("FTP connection error", err);
        reject(err);
      });

      client.connect({
        host: this.ftpConfig.host,
        port: this.ftpConfig.port,
        user: this.ftpConfig.user,
        password: this.ftpConfig.password,
      });
    });
  }

  disconnect(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.ftpClient) {
      this.ftpClient.end();
      this.ftpClient = null;
    }
  }

  startMonitoring(onDeath: (death: DeathEvent) => void): void {
    this.onDeathCallback = onDeath;

    // Check log file immediately
    this.checkLogFile();

    // Set up interval checking
    this.intervalId = setInterval(() => {
      this.checkLogFile();
    }, this.ftpConfig.checkInterval * 1000);

    this.logger.info(
      `Started log monitoring with ${this.ftpConfig.checkInterval}s interval`
    );
  }

  private async checkLogFile(): Promise<void> {
    if (!this.ftpClient || !this.onDeathCallback) {
      return;
    }

    try {
      const logContent = await this.downloadLogFile();
      const newLines = await this.getNewLines(logContent);

      if (newLines.length > 0) {
        this.logger.debug(`Processing ${newLines.length} new log lines`);
        await this.parseLogLines(newLines);
      }
    } catch (error) {
      this.logger.error("Failed to check log file", error);
    }
  }

  private downloadLogFile(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.ftpClient) {
        reject(new Error("FTP client not connected"));
        return;
      }

      this.ftpClient.get(this.ftpConfig.logPath, (err: any, stream: any) => {
        if (err) {
          reject(err);
          return;
        }

        let data = "";
        stream.on("data", (chunk: any) => {
          data += chunk.toString();
        });

        stream.on("end", () => {
          resolve(data);
        });

        stream.on("error", (error: any) => {
          reject(error);
        });
      });
    });
  }

  private async getNewLines(logContent: string): Promise<string[]> {
    const currentLength = logContent.length;

    // If file is smaller than before, it was rotated/reset
    if (currentLength < this.lastLogPosition) {
      this.logger.info(
        "Log file appears to have been rotated, processing from start"
      );
      this.lastLogPosition = 0;
    }

    // Find new content since last check
    const newContent = logContent.substring(this.lastLogPosition);
    this.lastLogPosition = currentLength;

    // Save the updated position to prevent re-processing on restart
    await this.storageService.saveLogState({
      lastProcessedPosition: this.lastLogPosition,
      lastProcessedTimestamp: new Date().toISOString(),
      lastUpdateTime: new Date().toISOString(),
    });

    return newContent.split("\n").filter((line) => line.trim().length > 0);
  }

  private async parseLogLines(lines: string[]): Promise<void> {
    const activities: Array<{
      type: ActivityType;
      match: RegExpExecArray;
      logLine: string;
    }> = [];

    // First pass: collect all deaths and activities
    for (const line of lines) {
      // Process deaths (existing functionality)
      const deathEvent = this.parseDeathMessage(line);
      if (deathEvent) {
        this.logger.debug(
          `Parsed death from log: ${deathEvent.playerId} - ${deathEvent.cause}`
        );
        this.onDeathCallback!(deathEvent);
      }

      // Collect other player activities for batch processing
      this.collectPlayerActivity(line, activities);
    }

    // Second pass: batch process activities
    if (activities.length > 0) {
      await this.processBatchedActivities(activities);
    }
  }

  private collectPlayerActivity(
    logLine: string,
    activities: Array<{
      type: ActivityType;
      match: RegExpExecArray;
      logLine: string;
    }>
  ): void {
    // Check each activity pattern
    for (const [activityType, pattern] of Object.entries(
      LogParserService.ACTIVITY_PATTERNS
    )) {
      if (activityType === "DEATH") continue; // Deaths handled separately

      const match = pattern.exec(logLine);
      if (match) {
        activities.push({
          type: activityType as ActivityType,
          match,
          logLine,
        });
        break; // Only process one activity type per line
      }
    }
  }

  private async processBatchedActivities(
    activities: Array<{
      type: ActivityType;
      match: RegExpExecArray;
      logLine: string;
    }>
  ): Promise<void> {
    // Parse all activities first
    const parsedActivities = activities
      .map(({ type, match, logLine }) =>
        this.parseActivity(type, match, logLine)
      )
      .filter((activity): activity is NewPlayerActivity => activity !== null);

    // Batch store all activities concurrently
    if (parsedActivities.length > 0) {
      await Promise.all(
        parsedActivities.map((activity) =>
          this.storageService.storeActivity(activity)
        )
      );

      this.logger.debug(
        `Batch processed ${parsedActivities.length} activities`
      );
    }
  }

  private parseActivity(
    type: ActivityType,
    match: RegExpExecArray,
    logLine: string
  ): NewPlayerActivity | null {
    try {
      const timestamp = new Date();
      const username = match[2];

      switch (type) {
        case "JOIN":
          return {
            username,
            timestamp,
            activity_type: "JOIN",
            metadata: ActivityParser.extractJoinMetadata(logLine),
          };

        case "LEAVE":
          return {
            username,
            timestamp,
            activity_type: "LEAVE",
            metadata: ActivityParser.extractLeaveMetadata(logLine),
          };

        case "CHAT":
          return {
            username,
            timestamp,
            activity_type: "CHAT",
            metadata: ActivityParser.extractChatMetadata(match[3] || ""),
          };

        case "ACHIEVEMENT":
          return {
            username,
            timestamp,
            activity_type: "ACHIEVEMENT",
            metadata: ActivityParser.extractAchievementMetadata(
              match[3] || "",
              logLine
            ),
          };

        default:
          return null;
      }
    } catch (error) {
      this.logger.warn(`Failed to parse activity: ${type}`, { error, logLine });
      return null;
    }
  }

  private parseDeathMessage(logLine: string): DeathEvent | null {
    // Minecraft death messages in logs look like:
    // [19:45:30] [Server thread/INFO]: Player fell from a high place
    // [19:45:30] [Server thread/INFO]: Player was slain by Zombie
    // [19:45:30] [Server thread/INFO]: Player drowned

    // Extract timestamp and message
    const timestampMatch = logLine.match(/^\[(\d{2}:\d{2}:\d{2})\]/);
    if (!timestampMatch) {
      return null;
    }

    // Comprehensive death message patterns based on Minecraft Wiki
    const deathPatterns = [
      // Cactus deaths
      /(\w+) was pricked to death/,
      /(\w+) walked into a cactus while trying to escape (.+)/,

      // Drowning deaths
      /(\w+) drowned/,
      /(\w+) drowned while trying to escape (.+)/,

      // Drying out (dolphins/axolotls)
      /(\w+) died from dehydration/,
      /(\w+) died from dehydration while trying to escape (.+)/,

      // Elytra collision
      /(\w+) experienced kinetic energy/,
      /(\w+) experienced kinetic energy while trying to escape (.+)/,

      // Explosions
      /(\w+) blew up/,
      /(\w+) was blown up by (.+)/,
      /(\w+) was blown up by (.+) using (.+)/,
      /(\w+) was killed by \[Intentional Game Design\]/,

      // Falling deaths
      /(\w+) hit the ground too hard/,
      /(\w+) hit the ground too hard while trying to escape (.+)/,
      /(\w+) fell from a high place/,
      /(\w+) fell off a ladder/,
      /(\w+) fell off some vines/,
      /(\w+) fell off some weeping vines/,
      /(\w+) fell off some twisting vines/,
      /(\w+) fell off scaffolding/,
      /(\w+) fell while climbing/,
      /(\w+) was doomed to fall/,
      /(\w+) was doomed to fall by (.+)/,
      /(\w+) was doomed to fall by (.+) using (.+)/,
      /(\w+) was impaled on a stalagmite/,
      /(\w+) was impaled on a stalagmite while fighting (.+)/,

      // Falling blocks
      /(\w+) was squashed by a falling anvil/,
      /(\w+) was squashed by a falling block/,
      /(\w+) was skewered by a falling stalactite/,

      // Fire deaths
      /(\w+) went up in flames/,
      /(\w+) walked into fire while fighting (.+)/,
      /(\w+) burned to death/,
      /(\w+) was burned to a crisp while fighting (.+)/,

      // Firework deaths
      /(\w+) went off with a bang/,
      /(\w+) went off with a bang due to a firework fired from (.+) by (.+)/,

      // Lava deaths
      /(\w+) tried to swim in lava/,
      /(\w+) tried to swim in lava to escape (.+)/,

      // Lightning deaths
      /(\w+) was struck by lightning/,
      /(\w+) was struck by lightning while fighting (.+)/,

      // Magma block deaths
      /(\w+) discovered the floor was lava/,
      /(\w+) walked into the danger zone due to (.+)/,

      // Magic deaths (instant damage, evoker fangs, guardian laser)
      /(\w+) was killed by magic/,
      /(\w+) was killed by magic while trying to escape (.+)/,
      /(\w+) was killed by (.+) using magic/,
      /(\w+) was killed by (.+) using (.+)/,

      // Powder snow deaths
      /(\w+) froze to death/,
      /(\w+) was frozen to death by (.+)/,

      // Player and mob attacks
      /(\w+) was slain by (.+)/,
      /(\w+) was slain by (.+) using (.+)/,
      /(\w+) was stung to death/,
      /(\w+) was stung to death by (.+) using (.+)/,
      /(\w+) was obliterated by a sonically-charged shriek/,
      /(\w+) was obliterated by a sonically-charged shriek while trying to escape (.+) wielding (.+)/,
      /(\w+) was smashed by (.+)/,
      /(\w+) was smashed by (.+) with (.+)/,

      // Projectile deaths
      /(\w+) was shot by (.+)/,
      /(\w+) was shot by (.+) using (.+)/,
      /(\w+) was pummeled by (.+)/,
      /(\w+) was pummeled by (.+) using (.+)/,
      /(\w+) was fireballed by (.+)/,
      /(\w+) was fireballed by (.+) using (.+)/,
      /(\w+) was shot by a skull from (.+)/,
      /(\w+) was shot by a skull from (.+) using (.+)/,

      // Starvation deaths
      /(\w+) starved to death/,
      /(\w+) starved to death while fighting (.+)/,

      // Suffocation deaths
      /(\w+) suffocated in a wall/,
      /(\w+) suffocated in a wall while fighting (.+)/,
      /(\w+) was squished too much/,
      /(\w+) was squashed by (.+)/,
      /(\w+) left the confines of this world/,
      /(\w+) left the confines of this world while fighting (.+)/,

      // Sweet berry bush deaths
      /(\w+) was poked to death by a sweet berry bush/,
      /(\w+) was poked to death by a sweet berry bush while trying to escape (.+)/,

      // Thorns enchantment deaths
      /(\w+) was killed while trying to hurt (.+)/,
      /(\w+) was killed by (.+) while trying to hurt (.+)/,

      // Trident deaths
      /(\w+) was impaled by (.+)/,
      /(\w+) was impaled by (.+) with (.+)/,

      // Void deaths
      /(\w+) fell out of the world/,
      /(\w+) didn't want to live in the same world as (.+)/,

      // Wither effect deaths
      /(\w+) withered away/,
      /(\w+) withered away while fighting (.+)/,

      // Generic deaths
      /(\w+) died/,
      /(\w+) died because of (.+)/,
      /(\w+) was killed/,
      /(\w+) was killed while fighting (.+)/,

      // Dragon breath (rare)
      /(\w+) was roasted in dragon's breath/,
      /(\w+) was roasted in dragon's breath by (.+)/,

      // Crash prevention fallback
      /(\w+) was killed by even more magic/,
    ];

    for (const pattern of deathPatterns) {
      const match = pattern.exec(logLine);
      if (match) {
        const playerId = match[1];
        let cause = match[0].substring(playerId.length + 1); // Remove player name and space

        // Clean up the cause message
        if (
          cause.startsWith("was ") ||
          cause.startsWith("fell ") ||
          cause.startsWith("drowned") ||
          cause.startsWith("suffocated") ||
          cause.startsWith("starved") ||
          cause.startsWith("withered") ||
          cause.startsWith("burned") ||
          cause.startsWith("froze") ||
          cause.startsWith("went ") ||
          cause.startsWith("tried ") ||
          cause.startsWith("discovered") ||
          cause.startsWith("walked ") ||
          cause.startsWith("left ") ||
          cause.startsWith("experienced") ||
          cause.startsWith("didn't")
        ) {
          // Keep these messages as they are
        } else {
          cause = cause || "died of mysterious causes";
        }

        const today = new Date();
        const [hours, minutes, seconds] = timestampMatch[1]
          .split(":")
          .map(Number);

        // Create timestamp in server time (keep consistent for rate limiting)
        const timestamp = new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate(),
          hours,
          minutes,
          seconds
        );

        return {
          playerId,
          timestamp,
          cause,
          experienceLevel: 0, // We'll get this via RCON if needed
          serverName: "Minecraft Server",
        };
      }
    }

    return null;
  }

  // Health check method
  async testConnection(): Promise<boolean> {
    try {
      await this.connect();
      await this.downloadLogFile();
      this.disconnect();
      return true;
    } catch {
      return false;
    }
  }
}
