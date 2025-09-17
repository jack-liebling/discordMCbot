// T017: Bot startup and initialization coordinating all services
import { DiscordBot } from "./bot";
import { Logger, LogLevel } from "./logger";

class BotApplication {
  private bot!: DiscordBot;
  private logger = Logger.getInstance();
  private isShuttingDown = false;

  async initialize(): Promise<void> {
    try {
      // Set up logging level from environment
      const logLevel = process.env.LOG_LEVEL || "INFO";
      this.logger.setLevel(
        LogLevel[logLevel as keyof typeof LogLevel] || LogLevel.INFO
      );

      this.logger.logStartup("Initializing Discord MC Bot...");

      // Create and initialize bot
      this.bot = new DiscordBot();

      // Set up graceful shutdown handlers
      this.setupShutdownHandlers();

      this.logger.info("Bot application initialized successfully");
    } catch (error) {
      this.logger.error("Failed to initialize bot application", error);
      throw error;
    }
  }

  async start(): Promise<void> {
    try {
      this.logger.info("Starting Discord MC Bot...");

      await this.bot.start();

      this.logger.info("Discord MC Bot is now running!");
      this.logger.info("Press Ctrl+C to stop the bot");

      // Keep the process alive
      await this.keepAlive();
    } catch (error) {
      this.logger.error("Failed to start bot", error);
      process.exit(1);
    }
  }

  private async keepAlive(): Promise<void> {
    // This function keeps the process running
    return new Promise((resolve) => {
      // The process will be kept alive by the Discord client
      // and will only resolve when shutdown is triggered
      const checkShutdown = () => {
        if (this.isShuttingDown) {
          resolve();
        } else {
          setTimeout(checkShutdown, 1000);
        }
      };
      checkShutdown();
    });
  }

  private setupShutdownHandlers(): void {
    // Handle SIGINT (Ctrl+C)
    process.on("SIGINT", () => {
      this.logger.info(
        "Received SIGINT (Ctrl+C), initiating graceful shutdown..."
      );
      this.shutdown().catch((error) => {
        this.logger.error("Error during shutdown", error);
        process.exit(1);
      });
    });

    // Handle SIGTERM
    process.on("SIGTERM", () => {
      this.logger.info("Received SIGTERM, initiating graceful shutdown...");
      this.shutdown().catch((error) => {
        this.logger.error("Error during shutdown", error);
        process.exit(1);
      });
    });

    // Handle uncaught exceptions
    process.on("uncaughtException", (error) => {
      this.logger.error("Uncaught exception", error);
      this.shutdown().catch(() => {
        process.exit(1);
      });
    });

    // Handle unhandled promise rejections
    process.on("unhandledRejection", (reason, promise) => {
      this.logger.error("Unhandled promise rejection", { reason, promise });
      this.shutdown().catch(() => {
        process.exit(1);
      });
    });
  }

  private async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return; // Already shutting down
    }

    this.isShuttingDown = true;

    try {
      this.logger.info("Graceful shutdown initiated...");

      // Stop the bot
      if (this.bot) {
        await this.bot.stop();
      }

      this.logger.logShutdown("Discord MC Bot shutdown complete");

      // Give logs time to flush
      setTimeout(() => {
        process.exit(0);
      }, 1000);
    } catch (error) {
      this.logger.error("Error during graceful shutdown", error);
      process.exit(1);
    }
  }

  // Health check endpoint (useful for monitoring)
  async getHealthStatus(): Promise<any> {
    if (!this.bot) {
      return { status: "not_initialized" };
    }

    const botStatus = this.bot.getStatus();
    const healthCheck = await this.bot.healthCheck();

    return {
      status: healthCheck.overall ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      uptime: botStatus.uptime,
      services: {
        discord: {
          connected: botStatus.isConnected,
          initialized: botStatus.isInitialized,
        },
        logParser: {
          connected: botStatus.logParserConnected,
          healthy: healthCheck.logParser,
        },
        announcements: {
          ready: botStatus.announcementServiceReady,
          healthy: healthCheck.announcement,
        },
      },
    };
  }
}

// Main execution function
async function main(): Promise<void> {
  const app = new BotApplication();

  try {
    await app.initialize();
    await app.start();
  } catch (error) {
    console.error("Failed to start application:", error);
    process.exit(1);
  }
}

// Export for testing or external usage
export { BotApplication };

// Run if this file is executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error("Unhandled error in main:", error);
    process.exit(1);
  });
}
