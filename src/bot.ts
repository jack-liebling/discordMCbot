// T016: Main Discord bot client setting up discord.js client and event handlers
import { Client, GatewayIntentBits, Events } from "discord.js";
import { ConfigLoader } from "./config";
import { StorageService } from "./storage";
import { DiscordFormatter } from "./discord";
import { PlayerTracker } from "./playerTracker";
import { AnnouncementService } from "./announcer";
import { LogParserService } from "./logParser";
import { Logger } from "./logger";

export class DiscordBot {
  private readonly client: Client;
  private readonly logger = Logger.getInstance();
  private readonly configLoader = ConfigLoader.getInstance();

  // Services
  private storageService!: StorageService;
  private formatter!: DiscordFormatter;
  private playerTracker!: PlayerTracker;
  private announcementService!: AnnouncementService;
  private logParserService?: LogParserService;

  // State
  private isInitialized = false;
  private isConnected = false;

  constructor() {
    // Create Discord client with required intents
    this.client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on(Events.ClientReady, async () => {
      this.logger.logStartup(
        `Discord bot logged in as ${this.client.user?.tag}`
      );
      this.isConnected = true;

      if (!this.isInitialized) {
        await this.initializeServices();
      }
    });

    this.client.on(Events.Error, (error) => {
      this.logger.error("Discord client error", error);
    });

    this.client.on(Events.Warn, (warning) => {
      this.logger.warn("Discord client warning", warning);
    });

    this.client.on(Events.Debug, (info) => {
      this.logger.debug("Discord client debug", info);
    });

    // Handle disconnection
    this.client.on(Events.ShardDisconnect, () => {
      this.logger.warn("Discord client disconnected");
      this.isConnected = false;
    });

    // Handle reconnection
    this.client.on(Events.ShardReconnecting, () => {
      this.logger.info("Discord client reconnecting...");
    });

    this.client.on(Events.ShardReady, () => {
      this.logger.info("Discord client shard ready");
      this.isConnected = true;
    });
  }

  private async initializeServices(): Promise<void> {
    try {
      this.logger.info("Initializing bot services...");

      // Initialize storage service
      this.storageService = new StorageService();

      // Get configuration
      const discordConfig = this.configLoader.getDiscordConfig();

      // Initialize Discord formatter (use generic server name)
      this.formatter = new DiscordFormatter("Minecraft Server");

      // Initialize player tracker
      this.playerTracker = new PlayerTracker(this.storageService);

      // Initialize announcement service
      this.announcementService = new AnnouncementService(
        this.client,
        this.formatter,
        discordConfig.channelId,
        discordConfig.guildId
      );

      // Initialize log parser - this is now required
      const ftpConfig = this.configLoader.getFtpConfig();
      if (!ftpConfig) {
        throw new Error("FTP configuration required for death monitoring");
      }

      this.logParserService = new LogParserService(
        ftpConfig,
        this.storageService
      );

      await this.logParserService.connect();
      this.logger.info("Log parser service connected successfully");

      // Set up log-based death detection
      this.logParserService.startMonitoring(async (deathEvent) => {
        // Process death event from log
        const result = await this.playerTracker.recordDeath(deathEvent);

        if (result.recorded && result.totalDeaths) {
          // Announce the death
          await this.announcementService.announcePlayerDeath(
            deathEvent,
            result.totalDeaths,
            result.previousDeathTimestamp
          );
        }
      });

      this.logger.info("Log-based death detection enabled");

      // Initialize announcement service
      await this.announcementService.initialize();

      // Send startup message
      await this.announcementService.sendBotStartup();

      this.logger.info("Log-based death detection active");

      this.isInitialized = true;
      this.logger.info("All bot services initialized successfully");
    } catch (error) {
      this.logger.error("Failed to initialize bot services", error);
      throw error;
    }
  }

  async start(): Promise<void> {
    try {
      // Validate configuration
      const validation = this.configLoader.validateConfig();
      if (!validation.isValid) {
        throw new Error(
          `Configuration validation failed: ${validation.errors.join(", ")}`
        );
      }

      // Login to Discord
      const discordConfig = this.configLoader.getDiscordConfig();
      await this.client.login(discordConfig.token);

      this.logger.info("Discord bot started successfully");
    } catch (error) {
      this.logger.error("Failed to start Discord bot", error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      this.logger.info("Shutting down Discord bot...");

      // Stop log parser if running
      if (this.logParserService) {
        this.logParserService.disconnect();
      }

      // Send shutdown message
      if (this.announcementService?.isServiceReady()) {
        await this.announcementService.sendBotShutdown();
      }

      // Destroy Discord client
      this.client.destroy();

      this.logger.logShutdown("Discord bot shutdown complete");
    } catch (error) {
      this.logger.error("Error during bot shutdown", error);
    }
  }

  // Get bot status information
  getStatus(): {
    isConnected: boolean;
    isInitialized: boolean;
    uptime: number;
    logParserConnected: boolean;
    announcementServiceReady: boolean;
  } {
    return {
      isConnected: this.isConnected,
      isInitialized: this.isInitialized,
      uptime: this.client.uptime || 0,
      logParserConnected: this.logParserService !== undefined,
      announcementServiceReady:
        this.announcementService?.isServiceReady() || false,
    };
  }

  // Test all connections and services
  async healthCheck(): Promise<{
    discord: boolean;
    logParser: boolean;
    announcement: boolean;
    overall: boolean;
  }> {
    const discord = this.isConnected;
    const logParser = this.logParserService !== undefined;
    const announcement = this.announcementService
      ? await this.announcementService.sendTestMessage()
      : false;

    return {
      discord,
      logParser,
      announcement,
      overall: discord && logParser && announcement,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
