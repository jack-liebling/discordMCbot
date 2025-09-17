// Log parser service for reading Minecraft server logs via FTP
import FtpClient = require("ftp");
import { FtpConfig, DeathEvent } from "./types";
import { Logger } from "./logger";
import { StorageService } from "./storage";

export class LogParserService {
  private readonly logger = Logger.getInstance();
  private readonly ftpConfig: FtpConfig;
  private readonly storageService: StorageService;
  private ftpClient: FtpClient | null = null;
  private lastLogPosition = 0;
  private intervalId: NodeJS.Timeout | null = null;
  private onDeathCallback: ((death: DeathEvent) => void) | null = null;

  constructor(ftpConfig: FtpConfig, storageService: StorageService) {
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
    for (const line of lines) {
      const deathEvent = this.parseDeathMessage(line);
      if (deathEvent) {
        this.logger.debug(
          `Parsed death from log: ${deathEvent.playerId} - ${deathEvent.cause}`
        );
        this.onDeathCallback!(deathEvent);
      }
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
      const match = logLine.match(pattern);
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
