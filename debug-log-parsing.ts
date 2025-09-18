// Debug script to test log parsing with the exact failing log lines
import { LogParserService } from "./src/logParser";
import { ConfigLoader } from "./src/config";

async function testLogParsing() {
  console.log("🔍 Testing log parsing with failing log lines...\n");

  const config = ConfigLoader.getInstance();
  const ftpConfig = config.getFtpConfig();
  
  if (!ftpConfig) {
    console.error("❌ No FTP config available");
    return;
  }

  // We don't need the actual database for this test
  const logParser = new LogParserService(ftpConfig, null as any);

  // Test the exact log lines that failed
  const failingLines = [
    "[20:02:04] [Server thread/INFO]: JackL64 joined the game",
    "[20:02:55] [Server thread/INFO]: JackL64 left the game"
  ];

  console.log("Testing log lines:");
  failingLines.forEach((line, i) => {
    console.log(`${i + 1}. ${line}`);
  });
  console.log("");

  // Access the private method via type assertion for testing
  const parser = logParser as any;

  for (const logLine of failingLines) {
    try {
      console.log(`🧪 Testing: ${logLine}`);
      
      // Test timestamp parsing first
      try {
        const timestamp = parser.parseTimestampFromLogLine(logLine);
        console.log(`✅ Timestamp parsed: ${timestamp.toISOString()}`);
      } catch (error) {
        console.log(`❌ Timestamp parsing failed: ${error}`);
        continue;
      }

      // Test regex matching
      const activityRegexes = parser.activityRegexes;
      
      for (const [type, regex] of Object.entries(activityRegexes)) {
        const match = regex.exec(logLine);
        if (match) {
          console.log(`✅ Regex matched for ${type}:`, match);
          
          try {
            const activity = parser.parseActivity(type, match, logLine);
            console.log(`✅ Activity parsed successfully:`, activity);
          } catch (error) {
            console.log(`❌ Activity parsing failed for ${type}:`, error);
            console.log(`❌ Error details:`, JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
          }
          break;
        }
      }

      console.log("");
    } catch (error) {
      console.log(`❌ Unexpected error: ${error}`);
      console.log("");
    }
  }
}

testLogParsing().catch(console.error);