// Test timestamp parsing specifically
import { ConfigLoader } from "./src/config";

function testTimestampParsing() {
  console.log("🔍 Testing timestamp parsing...\n");

  const config = ConfigLoader.getInstance();
  const ftpConfig = config.getFtpConfig();
  
  if (!ftpConfig) {
    console.error("❌ No FTP config available");
    return;
  }

  console.log("FTP Config timezone:", ftpConfig.timezone);
  console.log("");

  // Recreate the parseTimestampFromLogLine logic
  function parseTimestampFromLogLine(logLine: string, timezone: string): Date {
    const timestampPattern = /^\[(\d{2}:\d{2}:\d{2})\]/;
    const timestampMatch = timestampPattern.exec(logLine);
    if (!timestampMatch) {
      console.warn(`Could not parse timestamp from log line: ${logLine}`);
      return new Date(); // Fallback to current time
    }

    const [hours, minutes, seconds] = timestampMatch[1].split(":").map(Number);
    console.log(`Parsed time components: ${hours}:${minutes}:${seconds}`);

    // Get current date in the server's timezone to determine what "today" is
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const todayInServerTz = formatter.format(now); // Returns YYYY-MM-DD format
    console.log(`Today in server timezone (${timezone}): ${todayInServerTz}`);

    // Create timestamp string for today at the parsed time
    const timeStr = `${String(hours).padStart(2, "0")}:${String(
      minutes
    ).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    console.log(`Time string: ${timeStr}`);

    // Parse the time as if it's in UTC, then adjust for timezone
    const tempDate = new Date(`${todayInServerTz}T${timeStr}.000Z`);
    console.log(`Temp UTC date: ${tempDate.toISOString()}`);

    // Calculate timezone offset for the configured timezone
    const jan = new Date(tempDate.getFullYear(), 0, 1);
    const janOffset = getTimezoneOffsetForDate(jan, timezone);
    console.log(`January offset: ${janOffset} minutes`);

    // Use the current offset (accounting for DST)
    const currentOffset = getTimezoneOffsetForDate(tempDate, timezone);
    console.log(`Current offset: ${currentOffset} minutes`);

    // Adjust the timestamp by subtracting the timezone offset
    const logTimestamp = new Date(
      tempDate.getTime() - currentOffset * 60 * 1000
    );
    console.log(`Final timestamp: ${logTimestamp.toISOString()}`);

    return logTimestamp;
  }

  function getTimezoneOffsetForDate(date: Date, timezone: string): number {
    console.log(`Getting timezone offset for ${date.toISOString()} in ${timezone}`);
    
    try {
      // Get the time parts in UTC
      const utcParts = new Intl.DateTimeFormat("en-US", {
        timeZone: "UTC",
        hour12: false,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).formatToParts(date);

      // Get the time parts in target timezone
      const tzParts = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hour12: false,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).formatToParts(date);

      // Build UTC and timezone dates
      const utcTime = new Date(
        `${utcParts.find(p => p.type === 'year')?.value}-${utcParts.find(p => p.type === 'month')?.value}-${utcParts.find(p => p.type === 'day')?.value}T${utcParts.find(p => p.type === 'hour')?.value}:${utcParts.find(p => p.type === 'minute')?.value}:${utcParts.find(p => p.type === 'second')?.value}Z`
      );

      const tzTime = new Date(
        `${tzParts.find(p => p.type === 'year')?.value}-${tzParts.find(p => p.type === 'month')?.value}-${tzParts.find(p => p.type === 'day')?.value}T${tzParts.find(p => p.type === 'hour')?.value}:${tzParts.find(p => p.type === 'minute')?.value}:${tzParts.find(p => p.type === 'second')?.value}Z`
      );

      // Calculate offset in minutes
      const offsetMs = utcTime.getTime() - tzTime.getTime();
      const offsetMinutes = offsetMs / (1000 * 60);
      
      console.log(`UTC time: ${utcTime.toISOString()}`);
      console.log(`TZ time: ${tzTime.toISOString()}`);
      console.log(`Offset: ${offsetMinutes} minutes`);

      return offsetMinutes;
    } catch (error) {
      console.error("Error calculating timezone offset:", error);
      throw error;
    }
  }

  const testLogLines = [
    "[20:02:04] [Server thread/INFO]: JackL64 joined the game",
    "[20:02:55] [Server thread/INFO]: JackL64 left the game"
  ];

  for (const logLine of testLogLines) {
    console.log(`\n🧪 Testing: ${logLine}`);
    try {
      const timestamp = parseTimestampFromLogLine(logLine, ftpConfig.timezone);
      console.log(`✅ Final result: ${timestamp.toISOString()}`);
    } catch (error) {
      console.log(`❌ Error: ${error}`);
      console.log(`❌ Error details:`, JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    }
    console.log("─".repeat(60));
  }
}

testTimestampParsing();