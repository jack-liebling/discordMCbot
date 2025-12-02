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
  private readonly recentDeathEvents: Set<string> = new Set(); // Cache to prevent duplicate processing
  private readonly recentJoinEvents: Set<string> = new Set(); // Cache to prevent duplicate JOIN processing
  private readonly recentLeaveEvents: Set<string> = new Set(); // Cache to prevent duplicate LEAVE processing
  private readonly startupTime: Date;
  private readonly skipOldEvents: boolean = false;

  constructor(ftpConfig: FtpConfig, storageService: IStorageService) {
    this.ftpConfig = ftpConfig;
    this.storageService = storageService;
    this.startupTime = new Date();
  }

  private logReconnectError(error_: any) {
    this.logger.error("Failed to reconnect after permissions error", error_);
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

      // Verbose logging for connection config
      this.logger.info("Connecting to FTP server with config:", {
        host: this.ftpConfig.host,
        port: this.ftpConfig.port,
        user: this.ftpConfig.user,
        connTimeout: 20000,
        pasvTimeout: 20000,
        keepalive: 10000,
      });

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
        connTimeout: 20000,
        pasvTimeout: 20000,
        keepalive: 10000,
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
      const maxRetries = 3;
      let attempt = 0;
      const reconnectFtp = () => {
        this.disconnect();
        setTimeout(() => {
          this.connect().catch(this.logReconnectError);
        }, 5000);
      };
      const handleFtpError = (err: any) => {
        this.logger.error("FTP download error details", {
          errorMessage: err?.message || String(err),
          errorCode: err?.code,
          logPath: this.ftpConfig.logPath,
          ftpHost: this.ftpConfig.host,
          ftpUser: this.ftpConfig.user,
          attempt,
        });
        if (err?.message?.includes("privileges")) {
          this.logger.warn(
            "Permissions error detected - attempting reconnection"
          );
          reconnectFtp();
          reject(new Error(`FTP download error: ${err.message || err}`));
          return true;
        }
        if (err?.message?.toLowerCase().includes("timed out")) {
          this.logger.warn("FTP timeout detected - will retry");
          if (attempt < maxRetries) {
            setTimeout(tryDownload, 3000);
            return true;
          } else {
            this.logger.error("Max FTP download retries reached");
            reject(new Error(`FTP download error: ${err.message || err}`));
            return true;
          }
        }
        // Not handled specially, just log and reject
        reject(new Error(`FTP download error: ${err.message || err}`));
        return false;
      };
      const handleStream = (stream: any) => {
        if (!stream) {
          this.logger.error("FTP stream is undefined", {
            logPath: this.ftpConfig.logPath,
            attempt,
          });
          reject(new Error("FTP stream is undefined"));
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
          this.logger.error("FTP stream error", {
            errorMessage: error?.message || String(error),
            errorCode: error?.code,
            attempt,
          });
          reject(new Error(`Stream error: ${error?.message || error}`));
        });
      };
      const tryDownload = () => {
        attempt++;
        this.logger.info(`FTP log download attempt ${attempt}`);
        this.ftpClient?.get(this.ftpConfig.logPath, (err: any, stream: any) => {
          if (err) {
            if (handleFtpError(err)) return;
          } else {
            handleStream(stream);
          }
        });
      };
      tryDownload();
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
            .catch((error_) => {
              this.logger.error(
                "Both SIZE command and download fallback failed",
                error_
              );
              reject(
                new Error(
                  `Failed to get log file size: ${error_?.message || error_}`
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
      this.logger.debug(`🔍 Analyzing log line: "${line}"`);
      if (this.handleDeathEvent(line)) continue;
      if (this.handleJoinEvent(line)) continue;
      this.handleLeaveEvent(line);
    }
  }

  private handleDeathEvent(line: string): boolean {
    const deathEvent = this.parseDeathMessage(line);
    if (!deathEvent) return false;
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
      return true;
    }
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
    if (this.onDeathCallback) this.onDeathCallback(deathEvent);
    return true;
  }

  private handleJoinEvent(line: string): boolean {
    const joinEvent = this.parseJoinMessage(line);
    if (joinEvent && this.onJoinCallback) {
      this.logger.info(
        `Parsed join from log: ${
          joinEvent.username
        } at ${joinEvent.timestamp.toISOString()}`
      );
      this.onJoinCallback(joinEvent.username, joinEvent.timestamp);
      return true;
    }
    return false;
  }

  private handleLeaveEvent(line: string): boolean {
    const leaveEvent = this.parseLeaveMessage(line);
    if (leaveEvent && this.onLeaveCallback) {
      this.logger.info(
        `Parsed leave from log: ${
          leaveEvent.username
        } at ${leaveEvent.timestamp.toISOString()}`
      );
      this.onLeaveCallback(leaveEvent.username, leaveEvent.timestamp);
      return true;
    }
    return false;
  }

  private parseDeathMessage(logLine: string): DeathEvent | null {
    if (!this.hasValidTimestamp(logLine)) {
      this.logger.debug(`⏰ No timestamp found in line: "${logLine}"`);
      return null;
    }
    if (this.isChatOrCommandOrAction(logLine)) {
      this.logger.debug(`Filtered non-death message: "${logLine}"`);
      return null;
    }
    const timestamp = new Date();
    const deathEvent = this.matchDeathPattern(logLine, timestamp);
    if (deathEvent) {
      this.logger.debug(
        `� Parsed death: Player="${deathEvent.username}", Cause="${
          deathEvent.cause
        }", Killer="${
          deathEvent.killerUsername || "none"
        }", Original="${logLine}"`
      );
      return deathEvent;
    }
    this.logger.debug(`❌ No death patterns matched for line: "${logLine}"`);
    return null;
  }

  private hasValidTimestamp(logLine: string): boolean {
    const timestampPattern = /^\[(\d{2}:\d{2}:\d{2})\]/;
    return !!timestampPattern.exec(logLine);
  }

  private isChatOrCommandOrAction(logLine: string): boolean {
    const chatPattern = /<\w+>/;
    const serverCommandPattern = /issued server command:\s*\//;
    const chatCommandPattern = /<\w+>\s*\//;
    const actionPattern = /\[Async Chat Thread[^\]]*\]:\s*\*\s*\w+/;
    return (
      chatPattern.test(logLine) ||
      serverCommandPattern.test(logLine) ||
      chatCommandPattern.test(logLine) ||
      actionPattern.test(logLine)
    );
  }

  private matchDeathPattern(
    logLine: string,
    timestamp: Date
  ): DeathEvent | null {
    for (const pattern of DEATH_PATTERNS) {
      const match = pattern.exec(logLine);
      if (match) {
        const playerId = match[1];
        const cause = this.cleanDeathCause(
          match[0].substring(playerId.length + 1)
        );
        const killerUsername = this.extractKiller(match[2]);
        if (killerUsername) {
          this.logger.info(
            `🗡️ PvP KILL DETECTED: ${killerUsername} killed ${playerId}`
          );
        }
        return {
          username: playerId,
          timestamp,
          cause,
          killerUsername,
        };
      }
    }
    return null;
  }

  private extractKiller(rawKiller: string | undefined): string | undefined {
    if (!rawKiller) return undefined;
    let potentialKiller = rawKiller.trim();
    if (potentialKiller.includes(" using ")) {
      potentialKiller = potentialKiller.split(" using ")[0].trim();
    }
    return this.isPlayerUsername(potentialKiller) ? potentialKiller : undefined;
  }

  private cleanDeathCause(cause: string): string {
    if (
      cause.startsWith("was ") ||
      cause.startsWith("fell ") ||
      cause.startsWith("drowned") ||
      cause.startsWith("suffocated")
    ) {
      return cause;
    }
    return cause || "died of mysterious causes";
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
      "Villager",
      "Armorer",
      "Butcher",
      "Cartographer",
      "Cleric",
      "Farmer",
      "Fisherman",
      "Fletcher",
      "Leatherworker",
      "Librarian",
      "Mason",
      "Stone Mason",
      "Shepherd",
      "Toolsmith",
      "Weaponsmith",
      "Nitwit",
      "Unemployed",
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

    // Basic player username pattern: 3-16 chars, must start with a letter, alphanumeric + underscore
    const playerPattern = /^[a-zA-Z]\w{2,15}$/;
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
