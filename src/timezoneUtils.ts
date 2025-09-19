// Timezone utility functions for converting UTC to New York time
import { Logger } from "./logger";

export class TimezoneUtils {
  private static readonly logger = Logger.getInstance();
  private static readonly NY_TIMEZONE = "America/New_York";

  /**
   * Convert a UTC Date to New York time
   * Automatically handles EST/EDT transitions
   */
  static toNewYorkTime(utcDate: Date): Date {
    try {
      // Use Intl.DateTimeFormat to get the time in New York timezone
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: TimezoneUtils.NY_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });

      const parts = formatter.formatToParts(utcDate);
      const partValues: { [key: string]: string } = {};

      parts.forEach((part) => {
        partValues[part.type] = part.value;
      });

      // Create a new Date object with the New York time components
      const nyDate = new Date(
        parseInt(partValues.year),
        parseInt(partValues.month) - 1, // Month is 0-indexed
        parseInt(partValues.day),
        parseInt(partValues.hour),
        parseInt(partValues.minute),
        parseInt(partValues.second)
      );

      return nyDate;
    } catch (error) {
      TimezoneUtils.logger.error("Error converting to New York time", error);
      // Fallback: assume EST (UTC-5)
      return new Date(utcDate.getTime() - 5 * 60 * 60 * 1000);
    }
  }

  /**
   * Format a UTC timestamp as New York time string
   * @param utcDate - UTC Date object
   * @param format - Format style ('short', 'long', 'time-only', 'date-only')
   */
  static formatAsNewYorkTime(
    utcDate: Date,
    format: "short" | "long" | "time-only" | "date-only" = "short"
  ): string {
    try {
      const options: Intl.DateTimeFormatOptions = {
        timeZone: TimezoneUtils.NY_TIMEZONE,
      };

      switch (format) {
        case "short":
          options.year = "numeric";
          options.month = "short";
          options.day = "numeric";
          options.hour = "numeric";
          options.minute = "2-digit";
          options.hour12 = true;
          break;
        case "long":
          options.weekday = "long";
          options.year = "numeric";
          options.month = "long";
          options.day = "numeric";
          options.hour = "numeric";
          options.minute = "2-digit";
          options.second = "2-digit";
          options.hour12 = true;
          break;
        case "time-only":
          options.hour = "numeric";
          options.minute = "2-digit";
          options.second = "2-digit";
          options.hour12 = true;
          break;
        case "date-only":
          options.year = "numeric";
          options.month = "short";
          options.day = "numeric";
          break;
      }

      return utcDate.toLocaleString("en-US", options);
    } catch (error) {
      TimezoneUtils.logger.error("Error formatting New York time", error);
      return utcDate.toISOString();
    }
  }

  /**
   * Check if New York is currently in Daylight Saving Time
   */
  static isNewYorkInDST(date: Date = new Date()): boolean {
    try {
      // Create two dates: one in January (definitely EST) and one in July (definitely EDT)
      const january = new Date(date.getFullYear(), 0, 1);
      const july = new Date(date.getFullYear(), 6, 1);

      // Get timezone offset for both dates
      const janOffset = TimezoneUtils.getNewYorkOffset(january);
      const julyOffset = TimezoneUtils.getNewYorkOffset(july);
      const currentOffset = TimezoneUtils.getNewYorkOffset(date);

      // If current offset matches July (which is EDT), we're in DST
      return currentOffset === julyOffset && julyOffset !== janOffset;
    } catch (error) {
      TimezoneUtils.logger.error("Error checking DST status", error);
      return false;
    }
  }

  /**
   * Get the timezone offset for New York time at a specific date
   */
  private static getNewYorkOffset(date: Date): number {
    try {
      const utc = date.getTime() + date.getTimezoneOffset() * 60000;
      const nyTime = new Date(utc + TimezoneUtils.getOffsetFromUTC(date));
      return nyTime.getTimezoneOffset();
    } catch (error) {
      TimezoneUtils.logger.error("Error getting NY offset", error);
      return 300; // Default to EST offset (UTC-5 = 300 minutes)
    }
  }

  /**
   * Get offset from UTC to New York in milliseconds
   */
  private static getOffsetFromUTC(date: Date): number {
    try {
      // Use a more reliable method with Intl.DateTimeFormat
      const utcTime = date.getTime();
      const nyFormatter = new Intl.DateTimeFormat("en", {
        timeZone: TimezoneUtils.NY_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });

      const nyTimeString = nyFormatter.format(date);
      const nyTime = new Date(nyTimeString);

      return nyTime.getTime() - utcTime;
    } catch (error) {
      TimezoneUtils.logger.error("Error calculating UTC offset", error);
      // Fallback: EST is UTC-5 (5 hours * 60 minutes * 60 seconds * 1000 ms)
      return -5 * 60 * 60 * 1000;
    }
  }

  /**
   * Get current New York time as a Date object
   */
  static getCurrentNewYorkTime(): Date {
    return TimezoneUtils.toNewYorkTime(new Date());
  }

  /**
   * Format a time difference in human-readable format
   */
  static formatTimeDifference(
    fromDate: Date,
    toDate: Date = new Date(),
    useNewYorkTime: boolean = true
  ): string {
    try {
      let from = fromDate;
      let to = toDate;

      if (useNewYorkTime) {
        from = TimezoneUtils.toNewYorkTime(fromDate);
        to = TimezoneUtils.toNewYorkTime(toDate);
      }

      const diffMs = to.getTime() - from.getTime();
      const diffSeconds = Math.floor(diffMs / 1000);

      if (diffSeconds < 60) {
        return `${diffSeconds} second${diffSeconds !== 1 ? "s" : ""} ago`;
      }

      const diffMinutes = Math.floor(diffSeconds / 60);
      if (diffMinutes < 60) {
        return `${diffMinutes} minute${diffMinutes !== 1 ? "s" : ""} ago`;
      }

      const diffHours = Math.floor(diffMinutes / 60);
      if (diffHours < 24) {
        const remainingMinutes = diffMinutes % 60;
        if (remainingMinutes > 0) {
          return `${diffHours}h ${remainingMinutes}m ago`;
        }
        return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
      }

      const diffDays = Math.floor(diffHours / 24);
      const remainingHours = diffHours % 24;
      if (remainingHours > 0) {
        return `${diffDays}d ${remainingHours}h ago`;
      }
      return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
    } catch (error) {
      TimezoneUtils.logger.error("Error formatting time difference", error);
      return "unknown time ago";
    }
  }

  /**
   * Debug function to show timezone information
   */
  static getTimezoneInfo(date: Date = new Date()): {
    utc: string;
    newYork: string;
    isDST: boolean;
    offset: string;
  } {
    try {
      const isDST = TimezoneUtils.isNewYorkInDST(date);
      const offsetHours = isDST ? -4 : -5; // EDT = UTC-4, EST = UTC-5

      return {
        utc: date.toISOString(),
        newYork: TimezoneUtils.formatAsNewYorkTime(date, "long"),
        isDST,
        offset: `UTC${offsetHours >= 0 ? "+" : ""}${offsetHours}`,
      };
    } catch (error) {
      TimezoneUtils.logger.error("Error getting timezone info", error);
      return {
        utc: date.toISOString(),
        newYork: "Error",
        isDST: false,
        offset: "UTC-5",
      };
    }
  }
}
