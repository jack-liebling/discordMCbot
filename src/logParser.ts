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
  private onJoinCallback: ((username: string, timestamp: Date) => void) | null =
    null;
  private onLeaveCallback:
    | ((username: string, timestamp: Date) => void)
    | null = null;
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

    this.logger.debug(
      `⏰ Timestamp found: ${timestampMatch[1]} in line: "${logLine}"`
    );

    // Use current time when processing the log entry
    // This represents when the server actually wrote this log entry
    const timestamp = new Date();

    // Look for death message patterns (Java Edition comprehensive list)
    const deathPatterns = [
      // Cactus
      /(\w+) was pricked to death/,
      /(\w+) walked into a cactus while trying to escape (.+)/,

      // Drowning
      /(\w+) drowned/,
      /(\w+) drowned while trying to escape (.+)/,

      // Drying out (dolphins/axolotls)
      /(\w+) died from dehydration/,
      /(\w+) died from dehydration while trying to escape (.+)/,

      // Elytra
      /(\w+) experienced kinetic energy/,
      /(\w+) experienced kinetic energy while trying to escape (.+)/,

      // Explosions
      /(\w+) blew up/,
      /(\w+) was blown up by (.+)/,
      /(\w+) was blown up by (.+) using (.+)/,
      /(\w+) was killed by \[Intentional Game Design\]/,

      // Falling
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

      // Fire
      /(\w+) went up in flames/,
      /(\w+) walked into fire while fighting (.+)/,
      /(\w+) burned to death/,
      /(\w+) was burned to a crisp while fighting (.+)/,

      // Firework rockets
      /(\w+) went off with a bang/,
      /(\w+) went off with a bang due to a firework fired from (.+) by (.+)/,

      // Lava
      /(\w+) tried to swim in lava/,
      /(\w+) tried to swim in lava to escape (.+)/,

      // Lightning
      /(\w+) was struck by lightning/,
      /(\w+) was struck by lightning while fighting (.+)/,

      // Magma block
      /(\w+) discovered the floor was lava/,
      /(\w+) walked into the danger zone due to (.+)/,

      // Magic (Instant Damage / evoker fangs / guardian laser)
      /(\w+) was killed by magic/,
      /(\w+) was killed by magic while trying to escape (.+)/,
      /(\w+) was killed by (.+) using magic/,
      /(\w+) was killed by (.+) using (.+)/,

      // Powder snow
      /(\w+) froze to death/,
      /(\w+) was frozen to death by (.+)/,

      // Players and mobs
      /(\w+) was slain by (.+)/,
      /(\w+) was slain by (.+) using (.+)/,
      /(\w+) was stung to death/,
      /(\w+) was stung to death by (.+) using (.+)/,
      /(\w+) was obliterated by a sonically-charged shriek/,
      /(\w+) was obliterated by a sonically-charged shriek while trying to escape (.+) wielding (.+)/,
      /(\w+) was smashed by (.+)/,
      /(\w+) was smashed by (.+) with (.+)/,

      // Projectiles
      /(\w+) was shot by (.+)/,
      /(\w+) was shot by (.+) using (.+)/,
      /(\w+) was pummeled by (.+)/,
      /(\w+) was pummeled by (.+) using (.+)/,
      /(\w+) was fireballed by (.+)/,
      /(\w+) was fireballed by (.+) using (.+)/,
      /(\w+) was shot by a skull from (.+)/,
      /(\w+) was shot by a skull from (.+) using (.+)/,

      // Starving
      /(\w+) starved to death/,
      /(\w+) starved to death while fighting (.+)/,

      // Suffocation
      /(\w+) suffocated in a wall/,
      /(\w+) suffocated in a wall while fighting (.+)/,
      /(\w+) was squished too much/,
      /(\w+) was squashed by (.+)/,
      /(\w+) left the confines of this world/,
      /(\w+) left the confines of this world while fighting (.+)/,

      // Sweet berry bushes
      /(\w+) was poked to death by a sweet berry bush/,
      /(\w+) was poked to death by a sweet berry bush while trying to escape (.+)/,

      // Thorns enchantment
      /(\w+) was killed while trying to hurt (.+)/,
      /(\w+) was killed by (.+) while trying to hurt (.+)/,

      // Trident
      /(\w+) was impaled by (.+)/,
      /(\w+) was impaled by (.+) with (.+)/,

      // Void
      /(\w+) fell out of the world/,
      /(\w+) didn't want to live in the same world as (.+)/,

      // Wither effect
      /(\w+) withered away/,
      /(\w+) withered away while fighting (.+)/,

      // Generic death
      /(\w+) died/,
      /(\w+) died because of (.+)/,
      /(\w+) was killed/,
      /(\w+) was killed while fighting (.+)/,

      // Dragon's breath
      /(\w+) was roasted in dragon's breath/,
      /(\w+) was roasted in dragon's breath by (.+)/,
    ];

    this.logger.debug(
      `🔎 Testing ${deathPatterns.length} death patterns against: "${logLine}"`
    );

    for (let i = 0; i < deathPatterns.length; i++) {
      const pattern = deathPatterns[i];
      const match = pattern.exec(logLine);
      if (match) {
        this.logger.debug(
          `✅ Pattern ${i + 1} matched: ${pattern.source} -> Player: "${
            match[1]
          }"`
        );

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

        this.logger.debug(
          `💀 Parsed death: Player="${playerId}", Cause="${cause}", Original="${match[0]}"`
        );

        return {
          username: playerId,
          timestamp,
          cause,
        };
      }
    }

    this.logger.debug(`❌ No death patterns matched for line: "${logLine}"`);
    return null;
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
}
