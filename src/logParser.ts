// Log parser service for reading Minecraft server logs via FTP
import FtpClient = require("ftp");
import { FtpConfig, DeathEvent, IStorageService } from "./types";
import { Logger } from "./logger";
import { DEATH_PATTERNS } from "./deathPatterns";

export class LogParserService {
  private readonly logger = Logger.getInstance();
  private readonly ftpConfig: FtpConfig;
  private readonly storageService: IStorageService;
  private ftpClient: FtpClient | null = null;
  private lastLogPosition = 0;
  private intervalId: NodeJS.Timeout | null = null;
  private onDeathCallback: ((death: DeathEvent) => void) | null = null;
  private onJoinCallback: ((username: string, timestamp: Date) => void) | null =
    null;
  private onLeaveCallback:
    | ((username: string, timestamp: Date) => void)
    | null = null;
  private recentDeathEvents: Set<string> = new Set(); // Cache to prevent duplicate processing
  private recentJoinEvents: Set<string> = new Set(); // Cache to prevent duplicate JOIN processing
  private recentLeaveEvents: Set<string> = new Set(); // Cache to prevent duplicate LEAVE processing
  private readonly startupTime: Date;
  private readonly skipOldEvents: boolean = false;

  constructor(ftpConfig: FtpConfig, storageService: IStorageService) {
    this.ftpConfig = ftpConfig;
    this.storageService = storageService;
    this.startupTime = new Date();
  }

  enableSkipOldEvents(): void {
    (this as any).skipOldEvents = true;
    this.logger.info(
      "Skip old events mode enabled - will only process new events after startup"
    );
  }

  async connect(): Promise<void> {
    // Load saved log state to prevent re-processing old entries
    const logState = await this.storageService.getLogState();

    return new Promise((resolve, reject) => {
      this.ftpClient = new FtpClient();
      const client = this.ftpClient;

      client.on("ready", () => {
        this.logger.info(`FTP connected to ${this.ftpConfig.host}`);

        // Handle skip mode after FTP connection is established
        this.handleSkipModeSetup(logState)
          .then(() => resolve())
          .catch((error) => {
            this.logger.error(
              "Failed to setup skip mode, falling back to normal mode",
              error
            );
            // Fall back to normal mode to prevent processing entire log
            this.lastLogPosition = logState?.lastProcessedPosition ?? 0;
            this.logger.info(
              `Fallback: Starting log monitoring from position: ${this.lastLogPosition}`
            );
            resolve();
          });
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

  private async handleSkipModeSetup(logState: any): Promise<void> {
    if (this.skipOldEvents) {
      // Skip old events mode: jump to end of log file to only process new events
      this.logger.info("Skip old events mode: jumping to end of log file");

      this.lastLogPosition = await this.getLogFileSize();
      this.logger.info(
        `Starting log monitoring from end position: ${this.lastLogPosition}`
      );

      // Update the stored position so we don't re-process on next restart
      await this.storageService.saveLogState({
        lastProcessedPosition: this.lastLogPosition,
        lastProcessedTimestamp: new Date().toISOString(),
        lastUpdateTime: new Date().toISOString(),
      });
    } else {
      // Normal mode: resume from last position
      this.lastLogPosition = logState?.lastProcessedPosition ?? 0;
      this.logger.info(
        `Starting log monitoring from position: ${this.lastLogPosition}`
      );
    }
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

  startMonitoring(
    onDeath: (death: DeathEvent) => void,
    onJoin?: (username: string, timestamp: Date) => void,
    onLeave?: (username: string, timestamp: Date) => void
  ): void {
    this.onDeathCallback = onDeath;
    this.onJoinCallback = onJoin || null;
    this.onLeaveCallback = onLeave || null;

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
        this.parseLogLines(newLines);
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
          reject(new Error(`FTP download error: ${err.message || err}`));
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
          reject(new Error(`Stream error: ${error.message || error}`));
        });
      });
    });
  }

  private async getLogFileSize(): Promise<number> {
    return new Promise((resolve, reject) => {
      if (!this.ftpClient) {
        reject(new Error("FTP client not connected"));
        return;
      }

      // Use FTP SIZE command to get file size without downloading
      this.ftpClient.size(this.ftpConfig.logPath, (err: any, size: number) => {
        if (err) {
          this.logger.error(
            "Failed to get file size via SIZE command, falling back to download method",
            err
          );
          // Fallback to download method
          this.downloadLogFile()
            .then((content) => {
              const size = content.length;
              this.logger.info(
                `Got log file size via download fallback: ${size} bytes`
              );
              resolve(size);
            })
            .catch((downloadErr) => {
              this.logger.error(
                "Both SIZE command and download fallback failed",
                downloadErr
              );
              reject(
                new Error(
                  `Failed to get log file size: ${
                    downloadErr.message || downloadErr
                  }`
                )
              );
            });
        } else {
          this.logger.info(`Got log file size via SIZE command: ${size} bytes`);
          resolve(size);
        }
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

  private parseLogLines(lines: string[]): void {
    this.logger.debug(
      `Processing ${lines.length} new lines. Cache sizes: JOIN=${this.recentJoinEvents.size}, LEAVE=${this.recentLeaveEvents.size}, DEATH=${this.recentDeathEvents.size}`
    );

    for (const line of lines) {
      // Log each line being processed for death detection
      this.logger.debug(`🔍 Analyzing log line: "${line}"`);

      const deathEvent = this.parseDeathMessage(line);
      if (deathEvent) {
        // Create a unique key for this death event to prevent duplicates
        // Include timestamp to allow multiple deaths with same cause
        const deathKey = `${deathEvent.username}-${
          deathEvent.cause
        }-${deathEvent.timestamp.getTime()}`;

        this.logger.debug(`💀 Death event detected - Key: ${deathKey}`);
        this.logger.debug(
          `💀 Death details: Player="${deathEvent.username}", Cause="${
            deathEvent.cause
          }", Timestamp="${deathEvent.timestamp.toISOString()}"`
        );

        if (this.recentDeathEvents.has(deathKey)) {
          this.logger.debug(`🔄 Skipping duplicate death event: ${deathKey}`);
          continue;
        }

        // Add to cache and clean old entries (keep last 100 events)
        this.recentDeathEvents.add(deathKey);
        if (this.recentDeathEvents.size > 100) {
          const keys = Array.from(this.recentDeathEvents);
          this.recentDeathEvents.delete(keys[0]);
          this.logger.debug(`🧹 Cleaned oldest death cache entry: ${keys[0]}`);
        }

        this.logger.debug(
          `✅ Processing death event: ${deathEvent.username} - ${
            deathEvent.cause
          } at ${deathEvent.timestamp.toISOString()}`
        );

        this.logger.info(
          `💀 DEATH: ${deathEvent.username} ${deathEvent.cause} [Cache size: ${this.recentDeathEvents.size}]`
        );

        this.onDeathCallback!(deathEvent);
      } else {
        const joinEvent = this.parseJoinMessage(line);
        if (joinEvent && this.onJoinCallback) {
          this.logger.info(
            `Parsed join from log: ${
              joinEvent.username
            } at ${joinEvent.timestamp.toISOString()}`
          );
          this.onJoinCallback(joinEvent.username, joinEvent.timestamp);
        } else {
          const leaveEvent = this.parseLeaveMessage(line);
          if (leaveEvent && this.onLeaveCallback) {
            this.logger.info(
              `Parsed leave from log: ${
                leaveEvent.username
              } at ${leaveEvent.timestamp.toISOString()}`
            );
            this.onLeaveCallback(leaveEvent.username, leaveEvent.timestamp);
          }
        }
      }
    }
  }

  private parseDeathMessage(logLine: string): DeathEvent | null {
    // Minecraft death messages in logs look like:
    // [19:45:30] [Server thread/INFO]: Player fell from a high place
    // [19:45:30] [Server thread/INFO]: Player was slain by Zombie
    // [19:45:30] [Server thread/INFO]: Player drowned

    // Extract timestamp pattern to validate this is a timestamped log line
    const timestampPattern = /^\[(\d{2}:\d{2}:\d{2})\]/;
    const timestampMatch = timestampPattern.exec(logLine);
    if (!timestampMatch) {
      this.logger.debug(`⏰ No timestamp found in line: "${logLine}"`);
      return null;
    }

    // Check if this is a chat message (format: <username> message)
    // Chat messages should be ignored as they might contain death-like text
    const chatPattern = /<\w+>/;
    if (chatPattern.test(logLine)) {
      this.logger.debug(`💬 Chat message detected, ignoring: "${logLine}"`);
      return null;
    }

    // Check if this is a Minecraft slash command (either issued via server command or chat)
    // Commands can appear as:
    // [timestamp] [Server thread/INFO]: PlayerName issued server command: /command args
    // [timestamp] [Async Chat Thread/INFO]: <PlayerName> /command args
    const serverCommandPattern = /issued server command:\s*\//;
    const chatCommandPattern = /<\w+>\s*\//;
    if (
      serverCommandPattern.test(logLine) ||
      chatCommandPattern.test(logLine)
    ) {
      this.logger.debug(
        `⚡ Minecraft command detected, ignoring: "${logLine}"`
      );
      return null;
    }

    // Check if this is an action message (emote) from /me command
    // Action messages appear as: [timestamp] [Async Chat Thread/INFO]: * PlayerName action
    const actionPattern = /\[Async Chat Thread[^\]]*\]:\s*\*\s*\w+/;
    if (actionPattern.test(logLine)) {
      this.logger.debug(
        `🎭 Action message (emote) detected, ignoring: "${logLine}"`
      );
      return null;
    }

    this.logger.debug(
      `⏰ Timestamp found: ${timestampMatch[1]} in line: "${logLine}"`
    );

    // Use current time when processing the log entry
    // This represents when the server actually wrote this log entry
    const timestamp = new Date();

    // Use imported death patterns
    this.logger.debug(
      `🔎 Testing ${DEATH_PATTERNS.length} death patterns against: "${logLine}"`
    );

    for (let i = 0; i < DEATH_PATTERNS.length; i++) {
      const pattern = DEATH_PATTERNS[i];
      const match = pattern.exec(logLine);
      if (match) {
        this.logger.debug(
          `✅ Pattern ${i + 1} matched: ${pattern.source} -> Player: "${
            match[1]
          }"`
        );

        const playerId = match[1];
        let cause = match[0].substring(playerId.length + 1); // Remove player name and space
        let killerUsername: string | undefined;

        // Check if this is a PvP kill by examining capture groups
        // Handle patterns with "using weapon" vs simple killer patterns
        if (match[2]) {
          let potentialKiller = match[2].trim();

          // For patterns like "was slain by Player using Sword", the killer is still in match[2]
          // We need to extract just the killer name without the weapon part
          if (potentialKiller.includes(" using ")) {
            potentialKiller = potentialKiller.split(" using ")[0].trim();
          }

          if (this.isPlayerUsername(potentialKiller)) {
            killerUsername = potentialKiller;
            this.logger.info(
              `🗡️ PvP KILL DETECTED: ${killerUsername} killed ${playerId}`
            );
          }
        }

        // Clean up the cause message
        if (
          cause.startsWith("was ") ||
          cause.startsWith("fell ") ||
          cause.startsWith("drowned") ||
          cause.startsWith("suffocated")
        ) {
          // Keep these messages as they are
        } else {
          cause = cause || "died of mysterious causes";
        }

        this.logger.debug(
          `💀 Parsed death: Player="${playerId}", Cause="${cause}", Killer="${
            killerUsername || "none"
          }", Original="${match[0]}"`
        );

        return {
          username: playerId,
          timestamp,
          cause,
          killerUsername,
        };
      }
    }

    this.logger.debug(`❌ No death patterns matched for line: "${logLine}"`);
    return null;
  }

  /**
   * Helper function to detect if a killer name is likely a player username
   * Minecraft usernames are 3-16 characters, alphanumeric + underscore
   */
  private isPlayerUsername(name: string): boolean {
    // Remove common prefixes that indicate mobs/environment
    const cleanName = name.trim();

    // Skip obviously non-player entities
    const nonPlayerKeywords = [
      "a ",
      "an ",
      "the ",
      "Zombie",
      "Skeleton",
      "Creeper",
      "Spider",
      "Enderman",
      "Witch",
      "Blaze",
      "Ghast",
      "Slime",
      "Wither",
      "Dragon",
      "Phantom",
      "Pillager",
      "Vindicator",
      "Evoker",
      "Vex",
      "Ravager",
      "Guardian",
      "Elder Guardian",
      "Shulker",
      "Silverfish",
      "Endermite",
      "Cave Spider",
      "Magma Cube",
      "Husk",
      "Stray",
      "Wither Skeleton",
      "Piglin",
      "Hoglin",
      "Zoglin",
      "Zombified Piglin",
      "Strider",
      "Goat",
      "Axolotl",
      "Glow Squid",
      "Allay",
      "Frog",
      "Tadpole",
      "Warden",
      "Camel",
      "Sniffer",
      "Breeze",
      "Bogged",
      "Wolf",
      "Cat",
      "Ocelot",
      "Horse",
      "Donkey",
      "Mule",
      "Llama",
      "Trader Llama",
      "Wandering Trader",
      "Iron Golem",
      "Snow Golem",
      "Lightning",
      "Cactus",
      "Fire",
      "Lava",
      "Magma",
      "Berry Bush",
      "Intentional Game Design",
    ];

    // Check if the name contains any non-player keywords
    for (const keyword of nonPlayerKeywords) {
      if (cleanName.toLowerCase().includes(keyword.toLowerCase())) {
        return false;
      }
    }

    // Basic player username pattern: 3-16 chars, alphanumeric + underscore
    const playerPattern = /^\w{3,16}$/;
    return playerPattern.test(cleanName);
  }

  private parseJoinMessage(
    logLine: string
  ): { username: string; timestamp: Date } | null {
    // Join message format: [16:34:59] [Server thread/INFO]: MaroonFranc joined the game
    const joinPattern =
      /^\[(\d{2}:\d{2}:\d{2})\].*\[Server thread\/INFO\]:\s*(\w+)\s+joined the game/;
    const match = joinPattern.exec(logLine);

    if (match) {
      const username = match[2];

      // Use current time when processing the log entry
      const timestamp = new Date();

      return { username, timestamp };
    }

    return null;
  }

  private parseLeaveMessage(
    logLine: string
  ): { username: string; timestamp: Date } | null {
    // Leave message formats:
    // [16:37:04] [Server thread/INFO]: MaroonFranc left the game
    // [19:53:23] [Server thread/INFO]: JackL64 lost connection: Disconnected
    const leavePattern1 =
      /^\[(\d{2}:\d{2}:\d{2})\].*\[Server thread\/INFO\]:\s*(\w+)\s+left the game/;
    const leavePattern2 =
      /^\[(\d{2}:\d{2}:\d{2})\].*\[Server thread\/INFO\]:\s*(\w+)\s+lost connection:/;

    let match = leavePattern1.exec(logLine);
    if (match) {
      const username = match[2];

      // Use current time when processing the log entry
      const timestamp = new Date();

      return { username, timestamp };
    }

    match = leavePattern2.exec(logLine);
    if (match) {
      const username = match[2];

      // Use current time when processing the log entry
      const timestamp = new Date();

      return { username, timestamp };
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

  // Set callback for death events
  setOnDeathCallback(callback: (death: DeathEvent) => void): void {
    this.onDeathCallback = callback;
  }

  // Set callback for join events
  setOnJoinCallback(
    callback: (username: string, timestamp: Date) => void
  ): void {
    this.onJoinCallback = callback;
  }

  // Set callback for leave events
  setOnLeaveCallback(
    callback: (username: string, timestamp: Date) => void
  ): void {
    this.onLeaveCallback = callback;
  }
}
