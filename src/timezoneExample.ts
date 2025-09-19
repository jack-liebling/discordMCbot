// Example usage of TimezoneUtils
import { TimezoneUtils } from "./timezoneUtils";

// Example function showing how to use the timezone utilities
export function exampleTimezoneUsage() {
  const now = new Date();

  console.log("=== Timezone Utility Examples ===");

  // Convert UTC to New York time
  const nyTime = TimezoneUtils.toNewYorkTime(now);
  console.log(`UTC: ${now.toISOString()}`);
  console.log(`NY Time: ${nyTime.toISOString()}`);

  // Format timestamps in different styles
  console.log(
    `Short format: ${TimezoneUtils.formatAsNewYorkTime(now, "short")}`
  );
  console.log(`Long format: ${TimezoneUtils.formatAsNewYorkTime(now, "long")}`);
  console.log(
    `Time only: ${TimezoneUtils.formatAsNewYorkTime(now, "time-only")}`
  );
  console.log(
    `Date only: ${TimezoneUtils.formatAsNewYorkTime(now, "date-only")}`
  );

  // Check DST status
  const isDST = TimezoneUtils.isNewYorkInDST(now);
  console.log(`Is DST active: ${isDST} (${isDST ? "EDT" : "EST"})`);

  // Format time differences
  const pastTime = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2 hours ago
  const timeDiff = TimezoneUtils.formatTimeDifference(pastTime, now);
  console.log(`Time difference: ${timeDiff}`);

  // Get comprehensive timezone info
  const tzInfo = TimezoneUtils.getTimezoneInfo(now);
  console.log(`Timezone info:`, tzInfo);
}

// Export for potential use in testing or debugging
export { TimezoneUtils };
