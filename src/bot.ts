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
import { DatabaseService } from "./database";
import { DiscordFormatter } from "./discord";
import { PlayerTracker } from "./playerTracker";
import { SessionTracker } from "./sessionTracker";
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
  private storageService!: DatabaseService;
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

      // Initialize database storage service
      this.storageService = DatabaseService.getInstance();
      await this.storageService.initialize();

      // Initialize configuration with defaults
      await this.storageService.initializeConfig();

      // Get configuration
      const discordConfig = this.configLoader.getDiscordConfig();

      // Initialize Discord formatter (use generic server name)
      this.formatter = new DiscordFormatter(
        "Minecraft Server",
        this.storageService
      );

      // Initialize player tracker with type-safe storage interface
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

      // Enable skip old events mode if configured
      if (this.configLoader.shouldSkipOldEventsOnStartup()) {
        this.logParserService.enableSkipOldEvents();
      }

      await this.logParserService.connect();
      this.logger.info("Log parser service connected successfully");

      // Set up log-based death detection
      this.logParserService.startMonitoring(
        // Death callback
        async (deathEvent) => {
          // Process death event from log
          const result = await this.playerTracker.recordDeath(deathEvent);

          if (
            result.recorded &&
            result.totalDeaths &&
            result.timestampedEvent
          ) {
            // Announce the death
            await this.announcementService.announcePlayerDeath(
              result.timestampedEvent,
              result.totalDeaths,
              result.previousDeathTimestamp || undefined
            );
          }
        },
        // Join callback
        async (username, timestamp) => {
          await this.playerTracker.recordJoin(username, timestamp);
          this.logger.info(`Player joined: ${username}`);

          // Handle join announcement with @crafters role mention
          const joinLeaveConfig = this.configLoader.getJoinLeaveConfig();
          if (joinLeaveConfig) {
            // Check if user has a pending deletion - if so, cancel it
            const existingJoinMessage =
              await this.storageService.getJoinMessage(username);
            if (existingJoinMessage?.pendingDeletion) {
              await this.announcementService.cancelJoinMessageDeletion(
                username,
                this.storageService
              );
              this.logger.info(
                `Cancelled pending deletion for returning player ${username}`
              );
              return; // Keep existing join message, don't create new one
            }

            const joinMessage =
              await this.announcementService.announcePlayerJoin(
                username,
                timestamp,
                joinLeaveConfig.whoIsOnChannelId,
                joinLeaveConfig.craftersRoleId
              );

            if (joinMessage) {
              await this.storageService.saveJoinMessage(joinMessage);
              this.logger.info(`Saved join message for ${username}`);
            }
          }
        },
        // Leave callback
        async (username, timestamp) => {
          await this.playerTracker.recordLeave(username, timestamp);
          this.logger.info(`Player left: ${username}`);

          // Handle leave announcement with delayed deletion (1 minute)
          const joinMessage = await this.storageService.getJoinMessage(
            username
          );
          if (joinMessage && !joinMessage.pendingDeletion) {
            // Schedule delayed deletion instead of immediate deletion
            await this.announcementService.scheduleJoinMessageDeletion(
              username,
              joinMessage,
              this.storageService
            );
          } else if (joinMessage?.pendingDeletion) {
            this.logger.debug(
              `Join message for ${username} already pending deletion`
            );
          } else {
            this.logger.debug(
              `No join message found for ${username} to delete`
            );
          }
        }
      );

      this.logger.info("Log-based death detection enabled");

      // Initialize announcement service
      await this.announcementService.initialize();

      // Clean up orphaned join messages from previous bot sessions
      const joinLeaveConfig = this.configLoader.getJoinLeaveConfig();
      if (joinLeaveConfig) {
        await this.announcementService.cleanupOrphanedJoinMessages(
          joinLeaveConfig.whoIsOnChannelId
        );
      }

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
        new SlashCommandBuilder()
          .setName("reset-deaths")
          .setDescription("Reset all player death counts to zero (admin only)"),
        new SlashCommandBuilder()
          .setName("remove-player")
          .setDescription(
            "Remove a player from the database completely (admin only)"
          )
          .addStringOption((option) =>
            option
              .setName("username")
              .setDescription("Username of the player to remove")
              .setRequired(true)
          ),
        new SlashCommandBuilder()
          .setName("clear-channel")
          .setDescription(
            "Clear all messages from the current channel (admin only)"
          )
          .addIntegerOption((option) =>
            option
              .setName("amount")
              .setDescription(
                "Number of messages to delete (1-100, default: 50)"
              )
              .setMinValue(1)
              .setMaxValue(100)
              .setRequired(false)
          ),
        new SlashCommandBuilder()
          .setName("clear-join-messages")
          .setDescription(
            "Clear all join message records from the database (admin only)"
          ),
        new SlashCommandBuilder()
          .setName("set-player-deaths")
          .setDescription("Set a player's total death count (admin only)")
          .addStringOption((option) =>
            option
              .setName("username")
              .setDescription("Username of the player")
              .setRequired(true)
          )
          .addIntegerOption((option) =>
            option
              .setName("deaths")
              .setDescription("Number of deaths to set")
              .setMinValue(0)
              .setMaxValue(99999)
              .setRequired(true)
          ),
        new SlashCommandBuilder()
          .setName("player-stats")
          .setDescription("View detailed statistics for a player")
          .addStringOption((option) =>
            option
              .setName("username")
              .setDescription("Username of the player to view stats for")
              .setRequired(true)
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
          new SlashCommandBuilder()
            .setName("reset-deaths")
            .setDescription(
              "Reset all player death counts to zero (admin only)"
            ),
          new SlashCommandBuilder()
            .setName("remove-player")
            .setDescription(
              "Remove a player from the database completely (admin only)"
            )
            .addStringOption((option) =>
              option
                .setName("username")
                .setDescription("Username of the player to remove")
                .setRequired(true)
            ),
          new SlashCommandBuilder()
            .setName("clear-channel")
            .setDescription(
              "Clear all messages from the current channel (admin only)"
            )
            .addIntegerOption((option) =>
              option
                .setName("amount")
                .setDescription(
                  "Number of messages to delete (1-100, default: 50)"
                )
                .setMinValue(1)
                .setMaxValue(100)
                .setRequired(false)
            ),
          new SlashCommandBuilder()
            .setName("clear-join-messages")
            .setDescription(
              "Clear all join message records from the database (admin only)"
            ),
          new SlashCommandBuilder()
            .setName("set-player-deaths")
            .setDescription("Set a player's total death count (admin only)")
            .addStringOption((option) =>
              option
                .setName("username")
                .setDescription("Username of the player")
                .setRequired(true)
            )
            .addIntegerOption((option) =>
              option
                .setName("deaths")
                .setDescription("Number of deaths to set")
                .setMinValue(0)
                .setMaxValue(99999)
                .setRequired(true)
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
      } else if (interaction.commandName === "reset-deaths") {
        await this.handleResetDeathsCommand(interaction);
      } else if (interaction.commandName === "remove-player") {
        await this.handleRemovePlayerCommand(interaction);
      } else if (interaction.commandName === "clear-channel") {
        await this.handleClearChannelCommand(interaction);
      } else if (interaction.commandName === "clear-join-messages") {
        await this.handleClearJoinMessagesCommand(interaction);
      } else if (interaction.commandName === "set-player-deaths") {
        await this.handleSetPlayerDeathsCommand(interaction);
      } else if (interaction.commandName === "player-stats") {
        await this.handlePlayerStatsCommand(interaction);
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

  private isUserAdmin(userId: string): boolean {
    const adminUserIds = this.configLoader.getAdminUserIds();
    return adminUserIds.includes(userId);
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
      // Check admin permissions
      if (!this.isUserAdmin(interaction.user.id)) {
        await interaction.reply({
          content: "❌ You do not have permission to use this command.",
          ephemeral: true,
        });
        return;
      }

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
      // Check admin permissions
      if (!this.isUserAdmin(interaction.user.id)) {
        await interaction.reply({
          content: "❌ You do not have permission to use this command.",
          ephemeral: true,
        });
        return;
      }

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

  private async handleResetDeathsCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    try {
      // Check admin permissions
      if (!this.isUserAdmin(interaction.user.id)) {
        await interaction.reply({
          content: "❌ You do not have permission to use this command.",
          ephemeral: true,
        });
        return;
      }

      // Defer reply since this might take a moment
      await interaction.deferReply({ ephemeral: true });

      // Reset all player death counts
      const resetCount = await this.storageService.resetAllPlayerDeaths();

      await interaction.editReply({
        content:
          resetCount > 0
            ? `✅ Successfully reset death counts for ${resetCount} players.`
            : "✅ All player death counts were already at zero.",
      });

      this.logger.info(
        `Death counts reset by ${interaction.user.tag} - ${resetCount} players affected`
      );
    } catch (error) {
      this.logger.error("Failed to reset player death counts", error);

      await interaction.editReply({
        content: "❌ Failed to reset death counts. Please try again later.",
      });
    }
  }

  private async handleClearChannelCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    // Admin-only command
    if (!this.isUserAdmin(interaction.user.id)) {
      await interaction.reply({
        content: "❌ This command is restricted to administrators.",
        ephemeral: true,
      });
      return;
    }

    try {
      // Get the amount parameter (default to 50 if not provided)
      const amount = interaction.options.getInteger("amount") ?? 50;

      // Defer reply since this might take a moment
      await interaction.deferReply({ ephemeral: true });

      // Check if we're in a text channel that supports bulk delete
      if (!interaction.channel?.isTextBased()) {
        await interaction.editReply({
          content: "❌ This command can only be used in text channels.",
        });
        return;
      }

      // Check if this is a guild channel (not DM) which supports bulkDelete
      if (!interaction.guild) {
        await interaction.editReply({
          content: "❌ This command can only be used in server channels.",
        });
        return;
      }

      // Fetch messages to delete
      const messages = await interaction.channel.messages.fetch({
        limit: amount,
      });

      // Filter out messages older than 14 days (Discord limitation)
      const now = Date.now();
      const twoWeeksAgo = now - 14 * 24 * 60 * 60 * 1000;
      const deletableMessages = messages.filter(
        (msg) => msg.createdTimestamp > twoWeeksAgo
      );

      if (deletableMessages.size === 0) {
        await interaction.editReply({
          content:
            "❌ No messages found that can be deleted (messages must be less than 14 days old).",
        });
        return;
      }

      // Use bulkDelete for efficiency (max 100 messages)
      // Cast to GuildTextBasedChannel since we've verified it's in a guild
      const guildChannel = interaction.channel as any;
      const deletedMessages = await guildChannel.bulkDelete(
        deletableMessages,
        true
      );

      await interaction.editReply({
        content: `✅ Successfully deleted ${deletedMessages.size} messages from this channel.`,
      });

      this.logger.info(
        `Channel cleared by ${interaction.user.tag} - ${deletedMessages.size} messages deleted from ${interaction.channel.id}`
      );
    } catch (error) {
      this.logger.error("Failed to clear channel messages", error);

      await interaction.editReply({
        content:
          "❌ Failed to clear channel messages. Please check my permissions and try again.",
      });
    }
  }

  private async handleRemovePlayerCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    // Admin-only command
    if (!this.isUserAdmin(interaction.user.id)) {
      await interaction.reply({
        content: "❌ This command is restricted to administrators.",
        ephemeral: true,
      });
      return;
    }

    try {
      // Get the username parameter
      const username = interaction.options.getString("username", true);

      // Defer reply since this might take a moment
      await interaction.deferReply({ ephemeral: true });

      // Validate username format (basic validation)
      if (!username.trim() || username.length > 50) {
        await interaction.editReply({
          content: "❌ Invalid username. Username must be 1-50 characters.",
        });
        return;
      }

      // Try to delete the player
      const deleted = await this.storageService.deletePlayer(username.trim());

      if (deleted) {
        await interaction.editReply({
          content: `✅ Successfully removed player "${username}" from the database.`,
        });

        this.logger.info(
          `Player ${username} removed from database by ${interaction.user.tag}`
        );
      } else {
        await interaction.editReply({
          content: `❌ Player "${username}" was not found in the database.`,
        });

        this.logger.info(
          `Attempted to remove non-existent player ${username} by ${interaction.user.tag}`
        );
      }
    } catch (error) {
      this.logger.error("Failed to remove player from database", error);

      await interaction.editReply({
        content:
          "❌ Failed to remove player from database. Please try again later.",
      });
    }
  }

  private async handleClearJoinMessagesCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    // Admin-only command
    if (!this.isUserAdmin(interaction.user.id)) {
      await interaction.reply({
        content: "❌ This command is restricted to administrators.",
        ephemeral: true,
      });
      return;
    }

    try {
      // Defer reply since this might take a moment
      await interaction.deferReply({ ephemeral: true });

      // Clear all join messages from the database
      const deletedCount = await this.storageService.clearAllJoinMessages();

      if (deletedCount > 0) {
        await interaction.editReply({
          content: `✅ Successfully cleared ${deletedCount} join message records from the database.`,
        });

        this.logger.info(
          `Cleared ${deletedCount} join messages from database by ${interaction.user.tag}`
        );
      } else {
        await interaction.editReply({
          content: "✅ The join messages table was already empty.",
        });

        this.logger.info(
          `Join messages table already empty - cleared by ${interaction.user.tag}`
        );
      }
    } catch (error) {
      this.logger.error("Failed to clear join messages from database", error);

      await interaction.editReply({
        content: "❌ Failed to clear join messages. Please try again later.",
      });
    }
  }

  private async handleSetPlayerDeathsCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    // Admin-only command
    if (!this.isUserAdmin(interaction.user.id)) {
      await interaction.reply({
        content: "❌ This command is restricted to administrators.",
        ephemeral: true,
      });
      return;
    }

    try {
      // Get the username and deaths parameters
      const username = interaction.options.getString("username", true);
      const deaths = interaction.options.getInteger("deaths", true);

      // Defer reply since this might take a moment
      await interaction.deferReply({ ephemeral: true });

      // Validate username format (basic validation)
      if (!username.trim() || username.length > 50) {
        await interaction.editReply({
          content: "❌ Invalid username. Username must be 1-50 characters.",
        });
        return;
      }

      // Validate deaths value
      if (deaths < 0 || deaths > 99999) {
        await interaction.editReply({
          content: "❌ Deaths must be between 0 and 99999.",
        });
        return;
      }

      // Check if player exists first
      const existingPlayer = await this.storageService.getPlayer(
        username.trim()
      );

      if (!existingPlayer) {
        // Create new player with specified death count
        await this.storageService.updatePlayer(username.trim(), {
          totalDeaths: deaths,
          createdAt: new Date(),
        });

        await interaction.editReply({
          content: `✅ Created new player "${username}" with ${deaths} deaths.`,
        });

        this.logger.info(
          `Created new player ${username} with ${deaths} deaths by ${interaction.user.tag}`
        );
      } else {
        // Update existing player's death count
        const previousDeaths = existingPlayer.totalDeaths;
        await this.storageService.updatePlayer(username.trim(), {
          totalDeaths: deaths,
        });

        await interaction.editReply({
          content: `✅ Updated "${username}" death count from ${previousDeaths} to ${deaths}.`,
        });

        this.logger.info(
          `Updated player ${username} death count from ${previousDeaths} to ${deaths} by ${interaction.user.tag}`
        );
      }
    } catch (error) {
      this.logger.error("Failed to set player death count", error);

      await interaction.editReply({
        content: "❌ Failed to set player death count. Please try again later.",
      });
    }
  }

  private async handlePlayerStatsCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    try {
      await interaction.deferReply();

      const username = interaction.options.getString("username", true).trim();

      // Validate username
      if (!username || username.length > 50) {
        await interaction.editReply({
          content: "❌ Invalid username. Username must be 1-50 characters.",
        });
        return;
      }

      // Get player data
      const player = await this.storageService.getPlayer(username);

      if (!player) {
        await interaction.editReply({
          content: `❌ Player "${username}" not found in the database.`,
        });
        return;
      }

      // Get recent activities for more context
      const recentDeaths = await this.storageService.getPlayerActivities(
        username,
        "DEATH"
      );
      const recentJoins = await this.storageService.getPlayerActivities(
        username,
        "JOIN"
      );
      const recentLeaves = await this.storageService.getPlayerActivities(
        username,
        "LEAVE"
      );

      // Check if player is currently online
      const sessionTracker = new SessionTracker(this.storageService);
      const currentSessionStart = await sessionTracker.getCurrentSessionStart(
        username
      );
      const isOnline = currentSessionStart !== null;

      // Format last life duration
      const lastLifeFormatted = sessionTracker.formatLastLifeDuration(
        player.lastLifeDurationMs
      );

      // Format total online time
      const totalOnlineFormatted = sessionTracker.formatOnlineTime(
        player.onlineTimeMs
      );

      // Build stats embed
      const embed = {
        color: isOnline ? 0x00ff00 : 0x808080, // Green if online, gray if offline
        title: `📊 Player Statistics: ${username}`,
        fields: [
          {
            name: "💀 Total Deaths",
            value: `${player.totalDeaths}`,
            inline: true,
          },
          {
            name: "⏱️ Last Life Duration",
            value:
              player.lastLifeDurationMs > 0
                ? lastLifeFormatted
                : "No deaths yet",
            inline: true,
          },
          {
            name: "🕒 Total Online Time",
            value: totalOnlineFormatted,
            inline: true,
          },
          {
            name: "🔗 Status",
            value: isOnline ? "🟢 Online" : "⚫ Offline",
            inline: true,
          },
          {
            name: "📅 First Seen",
            value: `<t:${Math.floor(player.createdAt.getTime() / 1000)}:R>`,
            inline: true,
          },
          {
            name: "📈 Activity Summary",
            value: `${recentJoins.length} joins • ${recentLeaves.length} leaves • ${recentDeaths.length} deaths`,
            inline: true,
          },
        ],
        footer: {
          text: "Last life duration excludes offline time between Leave and Join events",
        },
        timestamp: new Date().toISOString(),
      };

      // Add last death info if player has died
      if (recentDeaths.length > 0) {
        const lastDeath = recentDeaths[0]; // Most recent death
        embed.fields.push({
          name: "💀 Last Death",
          value: `${lastDeath.details || "Unknown cause"} (<t:${Math.floor(
            lastDeath.timestamp.getTime() / 1000
          )}:R>)`,
          inline: false,
        });
      }

      // Add current session info if online
      if (isOnline && currentSessionStart) {
        const currentSessionDuration =
          Date.now() - currentSessionStart.getTime();
        const currentSessionFormatted = sessionTracker.formatOnlineTime(
          currentSessionDuration
        );

        embed.fields.push({
          name: "🚀 Current Session",
          value: `Started <t:${Math.floor(
            currentSessionStart.getTime() / 1000
          )}:R> (${currentSessionFormatted})`,
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [embed] });

      this.logger.info(
        `Player stats displayed for ${username} by ${interaction.user.tag}`
      );
    } catch (error) {
      this.logger.error("Failed to show player stats", error);

      await interaction.editReply({
        content: "❌ Failed to retrieve player stats. Please try again later.",
      });
    }
  }
}
