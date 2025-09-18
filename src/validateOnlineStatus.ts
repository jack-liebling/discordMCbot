// Validation script to check online status tracking
import { DatabaseService } from "./database";
import { Logger } from "./logger";
import { ConfigLoader } from "./config";

async function validateOnlineStatus() {
  const logger = Logger.getInstance();
  const config = ConfigLoader.getInstance().getConfig();

  if (!config.DATABASE_URL) {
    console.log("❌ No DATABASE_URL found - cannot validate online status");
    return;
  }

  const database = DatabaseService.getInstance(config.DATABASE_URL);

  try {
    await database.initialize();

    console.log("🔍 Validating online status tracking...\n");

    // Get all player sessions
    const sessions = await database.getAllPlayerSessions();

    if (sessions.length === 0) {
      console.log("ℹ️  No player sessions found in database");
      return;
    }

    console.log("📊 Current Player Session Status:");
    console.log("=" + "=".repeat(60));

    let onlineCount = 0;
    let offlineCount = 0;

    sessions.forEach((session) => {
      const status = session.isOnline ? "🟢 ONLINE" : "🔴 OFFLINE";
      const notification = session.hasActiveNotification
        ? "📧 Has Notification"
        : "📭 No Notification";
      const lastJoin = session.lastJoinTimestamp
        ? new Date(session.lastJoinTimestamp).toLocaleString()
        : "Never";
      const lastLeave = session.lastLeaveTimestamp
        ? new Date(session.lastLeaveTimestamp).toLocaleString()
        : "Never";

      console.log(
        `👤 ${session.username.padEnd(15)} ${status.padEnd(12)} ${notification}`
      );
      console.log(`   Last Join:  ${lastJoin}`);
      console.log(`   Last Leave: ${lastLeave}`);
      console.log("");

      if (session.isOnline) onlineCount++;
      else offlineCount++;
    });

    console.log("=" + "=".repeat(60));
    console.log(`📈 Summary: ${onlineCount} online, ${offlineCount} offline`);

    // Get current online players using the new method
    const onlinePlayers = await database.getCurrentlyOnlinePlayers();
    console.log(`🎮 Currently Online Players: [${onlinePlayers.join(", ")}]`);

    // Validate consistency
    const expectedOnline = sessions
      .filter((s) => s.isOnline)
      .map((s) => s.username)
      .sort();
    const actualOnline = onlinePlayers.sort();

    if (JSON.stringify(expectedOnline) === JSON.stringify(actualOnline)) {
      console.log("✅ Online status tracking is consistent!");
    } else {
      console.log("❌ Online status tracking inconsistency detected:");
      console.log(`   Expected: [${expectedOnline.join(", ")}]`);
      console.log(`   Actual:   [${actualOnline.join(", ")}]`);
    }
  } catch (error) {
    logger.error("Failed to validate online status", error);
    console.log("❌ Validation failed:", error);
  } finally {
    await database.close();
  }
}

// Run validation if called directly
if (require.main === module) {
  validateOnlineStatus().catch(console.error);
}

export { validateOnlineStatus };
