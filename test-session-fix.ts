// Test script to verify session notification fix
import { DatabaseService } from "./src/database";
import { ConfigLoader } from "./src/config";

async function testSessionNotificationLogic() {
  const config = ConfigLoader.getInstance().getConfig();
  
  if (!config.DATABASE_URL) {
    console.error("❌ No DATABASE_URL found in environment");
    process.exit(1);
  }

  const database = DatabaseService.getInstance(config.DATABASE_URL);
  
  try {
    await database.initialize();
    console.log("🔗 Connected to database");

    const testUsername = "TestUser";
    const testChannelId = "123456789";
    const testMessageId = "TEST_MESSAGE_ID";

    // Step 1: Create test player and simulate a JOIN event
    console.log("\n1️⃣ Creating test player and simulating JOIN event...");
    
    // Create test player first
    const dbPool = (database as any).pool;
    const dbClient = await dbPool.connect();
    
    try {
      await dbClient.query(`
        INSERT INTO players (username, total_deaths, first_seen, last_updated, last_seen_timestamp)
        VALUES ($1, 0, NOW(), NOW(), NOW())
        ON CONFLICT (username) DO NOTHING
      `, [testUsername]);
    } finally {
      dbClient.release();
    }
    
    // Update session state to online
    await database.updatePlayerSessionState(testUsername, true, new Date());
    
    // Record a notification
    await database.recordSessionNotification({
      username: testUsername,
      type: "JOIN",
      discordMessageId: testMessageId,
      discordChannelId: testChannelId,
      discordGuildId: "test_guild",
      expiresAt: new Date(Date.now() + 2 * 60 * 1000),
      timestamp: new Date()
    });
    
    console.log("✅ JOIN notification recorded");

    // Step 2: Check that notification can be found while user is online
    console.log("\n2️⃣ Testing notification lookup while online...");
    
    const activeNotification = await database.findActiveJoinNotification(testUsername, testChannelId);
    
    if (activeNotification && activeNotification.discordMessageId === testMessageId) {
      console.log("✅ Found active notification correctly");
    } else {
      console.log("❌ Failed to find active notification");
      return;
    }

    // Step 3: Simulate the NEW LOGIC - find notification BEFORE marking offline
    console.log("\n3️⃣ Testing LEAVE event with fixed logic...");
    
    // Find notification BEFORE updating session state (the fix)
    const notificationBeforeUpdate = await database.findActiveJoinNotification(testUsername, testChannelId);
    
    if (notificationBeforeUpdate) {
      console.log("✅ Found notification before marking offline");
      
      // Now update session state to offline
      await database.updatePlayerSessionState(testUsername, false, new Date());
      console.log("✅ Marked user as offline");
      
      // Try to find notification after marking offline (should fail with old logic)
      const notificationAfterUpdate = await database.findActiveJoinNotification(testUsername, testChannelId);
      
      if (!notificationAfterUpdate) {
        console.log("✅ Confirmed: notification not found after marking offline (expected behavior)");
        console.log("✅ Fix works! We found the notification BEFORE updating state");
      } else {
        console.log("❌ Unexpected: notification still found after marking offline");
      }
      
    } else {
      console.log("❌ Failed to find notification before updating state");
    }

    // Step 4: Clean up test data
    console.log("\n4️⃣ Cleaning up test data...");
    const cleanupPool = (database as any).pool;
    const cleanupClient = await cleanupPool.connect();
    
    try {
      await cleanupClient.query('DELETE FROM player_session_notifications WHERE username = $1', [testUsername]);
      await cleanupClient.query('DELETE FROM player_session_cooldowns WHERE username = $1', [testUsername]);
      await cleanupClient.query('DELETE FROM players WHERE username = $1', [testUsername]);
      console.log("✅ Test data cleaned up");
    } finally {
      cleanupClient.release();
    }

    console.log("\n🎉 Session notification fix verification completed!");

  } catch (error) {
    console.error("❌ Error during test:", error);
  } finally {
    await database.close();
  }
}

testSessionNotificationLogic().catch(console.error);