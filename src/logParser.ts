// Log parser service for reading Minecraft server logs via FTP
import FtpClient = require("ftp");
import { FtpConfig, DeathEvent, IStorageService } from "./types";
import { Logger } from "./logger";

export class LogParserService {
  private readonly logger = Logger.getInstance();
  private readonly ftpConfig: FtpConfig;
  private readonly storageService: IStorageService;
  private ftpClient: FtpClient | null = null;
  private lastLogPosition = 0;
  private intervalId: NodeJS.Timeout | null = null;
  private onDeathCallback: ((death: DeathEvent) => void) | null = null;
  private onJoinCallback: ((username: string) => void) | null = null;
  private onLeaveCallback: ((username: string) => void) | null = null;
  private recentDeathEvents: Set<string> = new Set(); // Cache to prevent duplicate processing
  private recentJoinEvents: Set<string> = new Set(); // Cache to prevent duplicate JOIN processing
  private recentLeaveEvents: Set<string> = new Set(); // Cache to prevent duplicate LEAVE processing

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

  startMonitoring(
    onDeath: (death: DeathEvent) => void,
    onJoin?: (username: string) => void,
    onLeave?: (username: string) => void
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

  private parseLogLines(lines: string[]): void {
    this.logger.debug(
      `Processing ${lines.length} new lines. Cache sizes: JOIN=${this.recentJoinEvents.size}, LEAVE=${this.recentLeaveEvents.size}, DEATH=${this.recentDeathEvents.size}`
    );

    for (const line of lines) {
      const deathEvent = this.parseDeathMessage(line);
      if (deathEvent) {
        // Create a unique key for this death event to prevent duplicates
        const deathKey = `${
          deathEvent.username
        }-${deathEvent.timestamp.getTime()}-${deathEvent.cause}`;

        if (this.recentDeathEvents.has(deathKey)) {
          this.logger.debug(`Skipping duplicate death event: ${deathKey}`);
          continue;
        }

        // Add to cache and clean old entries (keep last 100 events)
        this.recentDeathEvents.add(deathKey);
        if (this.recentDeathEvents.size > 100) {
          const keys = Array.from(this.recentDeathEvents);
          this.recentDeathEvents.delete(keys[0]);
        }

        this.logger.debug(
          `Parsed death from log: ${deathEvent.username} - ${deathEvent.cause}`
        );
        this.onDeathCallback!(deathEvent);
      } else {
        const joinEvent = this.parseJoinMessage(line);
        if (joinEvent && this.onJoinCallback) {
          this.logger.info(`Parsed join from log: ${joinEvent}`);
          this.onJoinCallback(joinEvent);
        } else {
          const leaveEvent = this.parseLeaveMessage(line);
          if (leaveEvent && this.onLeaveCallback) {
            this.logger.info(`Parsed leave from log: ${leaveEvent}`);
            this.onLeaveCallback(leaveEvent);
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

    // Extract timestamp and message
    const timestampPattern = /^\[(\d{2}:\d{2}:\d{2})\]/;
    const timestampMatch = timestampPattern.exec(logLine);
    if (!timestampMatch) {
      return null;
    }

    // Look for death message patterns
    const deathPatterns = [
      // Standard death messages
      /(\w+) fell from a high place/,
      /(\w+) was slain by (.+)/,
      /(\w+) was shot by (.+)/,
      /(\w+) was killed by (.+)/,
      /(\w+) drowned/,
      /(\w+) suffocated in a wall/,
      /(\w+) was blown up by (.+)/,
      /(\w+) hit the ground too hard/,
      /(\w+) fell off a ladder/,
      /(\w+) fell off some vines/,
      /(\w+) fell out of the world/,
      /(\w+) was struck by lightning/,
      /(\w+) burned to death/,
      /(\w+) went up in flames/,
      /(\w+) tried to swim in lava/,
      /(\w+) discovered floor was lava/,
      /(\w+) starved to death/,
      /(\w+) was pummeled by (.+)/,
      /(\w+) was pricked to death/,
      /(\w+) walked into a cactus whilst trying to escape (.+)/,
      /(\w+) was roasted in dragon breath/,
      /(\w+) withered away/,
      /(\w+) was squashed by (.+)/,
      /(\w+) experienced kinetic energy/,
      /(\w+) was impaled by (.+)/,
      /(\w+) was skewered by (.+)/,
      /(\w+) was obliterated by (.+)/,
      /(\w+) was killed by \[Intentional Game Design\]/,
      // Generic catch-all for any player death
      /(\w+) died/,
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
          cause.startsWith("suffocated")
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
          username: playerId,
          timestamp,
          cause,
        };
      }
    }

    return null;
  }

  private parseJoinMessage(logLine: string): string | null {
    // Join message format: [16:34:59] [Server thread/INFO]: MaroonFranc joined the game
    const joinPattern = /\[Server thread\/INFO\]:\s*(\w+)\s+joined the game/;
    const match = joinPattern.exec(logLine);

    if (match) {
      return match[1]; // Return the username
    }

    return null;
  }

  private parseLeaveMessage(logLine: string): string | null {
    // Leave message formats:
    // [16:37:04] [Server thread/INFO]: MaroonFranc left the game
    // [19:53:23] [Server thread/INFO]: JackL64 lost connection: Disconnected
    const leavePattern1 = /\[Server thread\/INFO\]:\s*(\w+)\s+left the game/;
    const leavePattern2 = /\[Server thread\/INFO\]:\s*(\w+)\s+lost connection:/;

    let match = leavePattern1.exec(logLine);
    if (match) {
      return match[1]; // Return the username
    }

    match = leavePattern2.exec(logLine);
    if (match) {
      return match[1]; // Return the username
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
