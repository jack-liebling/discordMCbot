// T016: Main Discord bot client setting up discord.js client and event handlers
import {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from "discord.js";
import { ConfigLoader } from "./config";
import { StorageService } from "./storage";
import { DiscordFormatter } from "./discord";
import { PlayerTracker } from "./playerTracker";
import { AnnouncementService } from "./announcer";
import { LogParserService } from "./logParser";
import { LeaderboardService } from "./leaderboardService";
import { SchedulerService } from "./schedulerService";
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
  private leaderboardService!: LeaderboardService;
  private schedulerService!: SchedulerService;

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
        // Register slash commands after services are initialized
        this.logger.info("About to register slash commands...");
        await this.registerSlashCommands();
        this.logger.info("Slash command registration completed");
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

    // Handle slash commands
    this.client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      await this.handleSlashCommand(interaction);
    });
  }

  private async initializeServices(): Promise<void> {
    try {
      this.logger.info("Initializing bot services...");

      // Initialize storage service
      this.storageService = new StorageService();

      // Initialize configuration with defaults
      await this.storageService.initializeConfig();

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

      // Initialize leaderboard services
      this.leaderboardService = new LeaderboardService(this.storageService);
      this.schedulerService = new SchedulerService(this.leaderboardService);

      // Connect scheduler to announcer service
      this.schedulerService.setAnnouncementCallback(async (leaderboard) => {
        await this.announcementService.announceDailyLeaderboard(leaderboard);
      });

      // Start the daily scheduler
      await this.schedulerService.start();
      this.logger.info("Daily leaderboard scheduler started");

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

      // Stop scheduler service
      if (this.schedulerService) {
        await this.schedulerService.stop();
      }

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

  // Slash command handling
  private async registerSlashCommands(): Promise<void> {
    try {
      this.logger.info("Registering slash commands...");

      const commands = [
        new SlashCommandBuilder()
          .setName("leaderboard")
          .setDescription(
            "Announce the current death leaderboard and survival champion to the channel"
          ),
        new SlashCommandBuilder()
          .setName("test-leaderboard")
          .setDescription(
            "Trigger a test daily leaderboard announcement (admin only)"
          ),
        new SlashCommandBuilder()
          .setName("reset-leaderboard")
          .setDescription(
            "Reset the daily announcement flag for testing (admin only)"
          ),
      ];

      const discordConfig = this.configLoader.getDiscordConfig();
      const rest = new REST({ version: "10" }).setToken(discordConfig.token);

      // Validate bot user exists
      if (!this.client.user) {
        throw new Error(
          "Bot user not available - commands cannot be registered"
        );
      }

      this.logger.info(`Bot ID: ${this.client.user.id}`);
      this.logger.info(`Guild ID: ${discordConfig.guildId}`);
      this.logger.info(
        `Registering ${commands.length} commands for guild ${discordConfig.guildId}`
      );

      const result = (await rest.put(
        Routes.applicationGuildCommands(
          this.client.user.id,
          discordConfig.guildId
        ),
        { body: commands }
      )) as any[];

      this.logger.info(
        `Successfully registered ${result.length} slash commands`
      );

      // Log each registered command
      result.forEach((cmd: any) => {
        this.logger.info(
          `Registered command: /${cmd.name} - ${cmd.description}`
        );
      });
    } catch (error) {
      this.logger.error("Failed to register slash commands", error);

      // If guild registration fails, try global registration as fallback
      try {
        this.logger.info(
          "Attempting global command registration as fallback..."
        );
        const discordConfig = this.configLoader.getDiscordConfig();
        const rest = new REST({ version: "10" }).setToken(discordConfig.token);

        const commands = [
          new SlashCommandBuilder()
            .setName("leaderboard")
            .setDescription(
              "Show the current death leaderboard and survival champion"
            ),
          new SlashCommandBuilder()
            .setName("test-leaderboard")
            .setDescription(
              "Trigger a test daily leaderboard announcement (admin only)"
            ),
          new SlashCommandBuilder()
            .setName("reset-leaderboard")
            .setDescription(
              "Reset the daily announcement flag for testing (admin only)"
            ),
        ];

        await rest.put(Routes.applicationCommands(this.client.user!.id), {
          body: commands,
        });

        this.logger.info(
          "Global command registration successful (may take up to 1 hour to appear)"
        );
      } catch (globalError) {
        this.logger.error(
          "Global command registration also failed",
          globalError
        );
      }
    }
  }

  private async handleSlashCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    try {
      if (interaction.commandName === "leaderboard") {
        await this.handleLeaderboardCommand(interaction);
      } else if (interaction.commandName === "test-leaderboard") {
        await this.handleTestLeaderboardCommand(interaction);
      } else if (interaction.commandName === "reset-leaderboard") {
        await this.handleResetLeaderboardCommand(interaction);
      }
    } catch (error) {
      this.logger.error(
        `Failed to handle slash command: ${interaction.commandName}`,
        error
      );

      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "❌ An error occurred while processing the command.",
          ephemeral: true,
        });
      }
    }
  }

  private async handleLeaderboardCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    try {
      // Defer reply since leaderboard generation might take a moment
      await interaction.deferReply();

      // Generate current leaderboard
      const leaderboard = await this.leaderboardService.generateLeaderboard();

      // Format as Discord embed
      const embed =
        this.announcementService.createLeaderboardEmbed(leaderboard);

      // Send the leaderboard publicly to the channel
      await interaction.editReply({ embeds: [embed] });

      this.logger.info(
        `Leaderboard command executed by ${interaction.user.tag} - announced publicly`
      );
    } catch (error) {
      this.logger.error("Failed to execute leaderboard command", error);

      await interaction.editReply({
        content: "❌ Failed to generate leaderboard. Please try again later.",
      });
    }
  }

  private async handleTestLeaderboardCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    try {
      // Defer reply since this might take a moment
      await interaction.deferReply({ ephemeral: true });

      // Trigger the daily announcement manually
      await this.schedulerService.triggerAnnouncement();

      await interaction.editReply({
        content:
          "✅ Test daily leaderboard announcement has been triggered! Check the announcement channel.",
      });

      this.logger.info(
        `Test leaderboard announcement triggered by ${interaction.user.tag}`
      );
    } catch (error) {
      this.logger.error(
        "Failed to trigger test leaderboard announcement",
        error
      );

      await interaction.editReply({
        content:
          "❌ Failed to trigger test announcement. Please try again later.",
      });
    }
  }

  private async handleResetLeaderboardCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    try {
      // Defer reply since this might take a moment
      await interaction.deferReply({ ephemeral: true });

      // Reset the announcement flag so we can test again today
      await this.leaderboardService.resetAnnouncementFlag();

      await interaction.editReply({
        content:
          "✅ Daily leaderboard announcement flag has been reset! You can now trigger `/test-leaderboard` again.",
      });

      this.logger.info(
        `Leaderboard announcement flag reset by ${interaction.user.tag}`
      );
    } catch (error) {
      this.logger.error("Failed to reset leaderboard announcement flag", error);

      await interaction.editReply({
        content:
          "❌ Failed to reset announcement flag. Please try again later.",
      });
    }
  }
}
