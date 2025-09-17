// T009: Basic logging utility for error and debug output
import { promises as fs } from "fs";
import { join } from "path";

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel = LogLevel.INFO;
  private logToFile: boolean = true;
  private logDir: string = join(process.cwd(), "logs");

  private constructor() {
    this.ensureLogDirectory();
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private async ensureLogDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
    } catch (error) {
      console.warn("Failed to create log directory:", error);
      this.logToFile = false;
    }
  }

  private formatMessage(level: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const dataStr = data ? ` ${JSON.stringify(data, null, 2)}` : "";
    return `[${timestamp}] ${level}: ${message}${dataStr}`;
  }

  private async writeToFile(level: string, message: string): Promise<void> {
    if (!this.logToFile) return;

    try {
      const filename = `bot-${new Date().toISOString().split("T")[0]}.log`;
      const filePath = join(this.logDir, filename);
      await fs.appendFile(filePath, message + "\n", "utf-8");
    } catch (error) {
      console.warn("Failed to write to log file:", error);
    }
  }

  private log(
    level: LogLevel,
    levelName: string,
    message: string,
    data?: any
  ): void {
    if (level < this.logLevel) return;

    const formattedMessage = this.formatMessage(levelName, message, data);

    // Always log to console
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(formattedMessage);
        break;
      case LogLevel.INFO:
        console.log(formattedMessage);
        break;
      case LogLevel.WARN:
        console.warn(formattedMessage);
        break;
      case LogLevel.ERROR:
        console.error(formattedMessage);
        break;
    }

    // Asynchronously write to file
    this.writeToFile(levelName, formattedMessage).catch(() => {
      // Ignore file write errors to prevent logging loops
    });
  }

  public debug(message: string, data?: any): void {
    this.log(LogLevel.DEBUG, "DEBUG", message, data);
  }

  public info(message: string, data?: any): void {
    this.log(LogLevel.INFO, "INFO", message, data);
  }

  public warn(message: string, data?: any): void {
    this.log(LogLevel.WARN, "WARN", message, data);
  }

  public error(message: string, error?: any): void {
    let errorData = error;

    // Format error objects for better logging
    if (error instanceof Error) {
      errorData = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    this.log(LogLevel.ERROR, "ERROR", message, errorData);
  }

  public setLevel(level: LogLevel): void {
    this.logLevel = level;
    this.info(`Log level set to ${LogLevel[level]}`);
  }

  public getLevel(): LogLevel {
    return this.logLevel;
  }

  // Convenience method for bot startup logging
  public logStartup(message: string): void {
    const separator = "=".repeat(50);
    this.info(separator);
    this.info(message);
    this.info(separator);
  }

  // Convenience method for bot shutdown logging
  public logShutdown(message: string): void {
    const separator = "-".repeat(50);
    this.info(separator);
    this.info(message);
    this.info(separator);
  }
}
