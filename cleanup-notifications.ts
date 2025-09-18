// Cleanup script to reset stale session notifications
import { DatabaseService } from "./src/database";
import { ConfigLoader } from "./src/config";

async function cleanupStaleNotifications() {
  const config = ConfigLoader.getInstance().getConfig();

  if (!config.DATABASE_URL) {
    console.error("❌ No DATABASE_URL found in environment");
    process.exit(1);
  }

  const database = DatabaseService.getInstance(config.DATABASE_URL);

  try {
    await database.initialize();
    console.log("🔗 Connected to database");

    // Get current stale notifications
    const pool = (database as any).pool;
    const client = await pool.connect();

    try {
      // Find all active notifications with message IDs
      const activeResult = await client.query(`
        SELECT username, notification_message_id, is_online, status
        FROM player_session_notifications 
        WHERE status = 'active' AND notification_message_id IS NOT NULL
      `);

      console.log(`📊 Found ${activeResult.rows.length} active notifications:`);
      activeResult.rows.forEach((row: any) => {
        console.log(
          `  - ${row.username}: ${row.notification_message_id} (online: ${row.is_online})`
        );
      });

      // Mark all existing notifications as deleted to clean up stale state
      const deleteResult = await client.query(`
        UPDATE player_session_notifications 
        SET status = 'deleted', 
            notification_message_id = NULL,
            delete_scheduled_at = NULL,
            updated_at = NOW()
        WHERE status = 'active' AND notification_message_id IS NOT NULL
      `);

      console.log(
        `✅ Marked ${deleteResult.rowCount} notifications as deleted`
      );

      // Reset all players to offline state
      const offlineResult = await client.query(`
        UPDATE player_session_notifications 
        SET is_online = false,
            updated_at = NOW()
        WHERE is_online = true
      `);

      console.log(`✅ Marked ${offlineResult.rowCount} players as offline`);

      // Clean up any scheduled deletions
      const scheduledResult = await client.query(`
        UPDATE player_session_notifications 
        SET delete_scheduled_at = NULL,
            updated_at = NOW()
        WHERE delete_scheduled_at IS NOT NULL
      `);

      console.log(`✅ Cleared ${scheduledResult.rowCount} scheduled deletions`);
    } finally {
      client.release();
    }

    console.log("🎉 Cleanup completed successfully!");
  } catch (error) {
    console.error("❌ Error during cleanup:", error);
  } finally {
    await database.close();
  }
}

cleanupStaleNotifications().catch(console.error);
