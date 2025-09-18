// Simple test to reproduce the log parsing error
import { ActivityParser } from "./src/activityParser";

async function testActivityParser() {
  console.log("🔍 Testing ActivityParser with failing log lines...\n");

  const testLogLines = [
    "[20:02:04] [Server thread/INFO]: JackL64 joined the game",
    "[20:02:55] [Server thread/INFO]: JackL64 left the game"
  ];

  for (const logLine of testLogLines) {
    console.log(`🧪 Testing: ${logLine}`);
    
    try {
      if (logLine.includes("joined the game")) {
        console.log("Testing extractJoinMetadata...");
        const joinMetadata = ActivityParser.extractJoinMetadata(logLine);
        console.log("✅ Join metadata:", JSON.stringify(joinMetadata, null, 2));
      } else if (logLine.includes("left the game")) {
        console.log("Testing extractLeaveMetadata...");
        const leaveMetadata = ActivityParser.extractLeaveMetadata(logLine);
        console.log("✅ Leave metadata:", JSON.stringify(leaveMetadata, null, 2));
      }
    } catch (error) {
      console.log("❌ Error:", error);
      console.log("❌ Error details:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    }
    console.log("");
  }

  // Test individual parsing methods
  console.log("🔍 Testing individual parsing methods...\n");

  const testLine = "[20:02:04] [Server thread/INFO]: JackL64 joined the game";
  
  try {
    console.log("Testing parseCoordinates...");
    const coords = ActivityParser.parseCoordinates(testLine);
    console.log("✅ Coordinates:", coords);
  } catch (error) {
    console.log("❌ parseCoordinates error:", error);
  }

  try {
    console.log("Testing parseDimension...");
    const dimension = ActivityParser.parseDimension(testLine);
    console.log("✅ Dimension:", dimension);
  } catch (error) {
    console.log("❌ parseDimension error:", error);
  }

  try {
    console.log("Testing parseIpAddress...");
    const ip = ActivityParser.parseIpAddress(testLine);
    console.log("✅ IP Address:", ip);
  } catch (error) {
    console.log("❌ parseIpAddress error:", error);
  }

  try {
    console.log("Testing parseEntityId...");
    const entityId = ActivityParser.parseEntityId(testLine);
    console.log("✅ Entity ID:", entityId);
  } catch (error) {
    console.log("❌ parseEntityId error:", error);
  }
}

testActivityParser().catch(console.error);