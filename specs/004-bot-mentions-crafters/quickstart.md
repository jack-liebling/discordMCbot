# Quickstart Guide: Player Session Notifications

**Feature**: Discord notifications when players join/leave Minecraft server with @Crafters role mentions

## Quick Setup

### 1. Environment Configuration

```bash
# Add to .env file
SESSION_NOTIFICATIONS_ENABLED=true
CRAFTERS_ROLE_ID=1234567890123456789  # Your @Crafters role ID
WHO_IS_ON_CHANNEL_ID=9876543210987654321  # Your "who-is-on" channel ID
SESSION_COOLDOWN_SECONDS=120  # 2-minute cooldown (default)
```

### 2. Database Migration

```bash
npm run migrate  # Applies 004-session-notifications.sql
```

### 3. Start Bot

```bash
npm start
```

## Testing Scenarios

### Scenario 1: Basic Join Notification with Delayed Deletion

**Goal**: Verify JOIN notification posting and delayed deletion after LEAVE

**Steps**:

1. Player joins Minecraft server
2. Check "who-is-on" Discord channel
3. Verify green JOIN embed appears with @Crafters mention
4. Player leaves Minecraft server
5. Wait 2 minutes
6. Verify JOIN message is automatically deleted

**Expected Results**:

- ✅ JOIN notification posted within 5 seconds
- ✅ @Crafters role mentioned and members notified
- ✅ No immediate LEAVE notification (JOIN stays visible)
- ✅ JOIN message automatically deleted 2 minutes after LEAVE

### Scenario 2: Cooldown Protection

**Goal**: Verify rapid join cycles are rate-limited

**Steps**:

1. Player joins server
2. Player immediately leaves (within 10 seconds)
3. Player rejoins within 2 minutes
4. Check Discord channel for notifications

**Expected Results**:

- ✅ First JOIN notification posted
- ✅ First JOIN message scheduled for deletion after LEAVE
- ❌ Second JOIN notification suppressed (cooldown active)
- ✅ Console shows cooldown message

### Scenario 3: Multiple Players

**Goal**: Verify concurrent session events handled correctly

**Steps**:

1. Player A joins server
2. Player B joins server (overlapping)
3. Player A leaves server
4. Player B leaves server

**Expected Results**:

- ✅ Both JOIN notifications posted
- ✅ Both @Crafters mentions trigger
- ✅ A's JOIN message scheduled for deletion 2 minutes after A leaves
- ✅ B's JOIN message scheduled for deletion 2 minutes after B leaves
- ✅ Messages deleted independently after their respective timers

### Scenario 4: Error Recovery

**Goal**: Verify graceful handling of Discord API issues

**Steps**:

1. Temporarily remove bot's message permissions
2. Player joins server
3. Restore bot permissions
4. Player leaves server

**Expected Results**:

- ❌ JOIN notification fails (logged error)
- ✅ Bot continues operating normally
- ✅ No LEAVE event processing needed (no notification to delete)

### Scenario 5: Configuration Validation

**Goal**: Verify proper error handling for invalid configuration

**Steps**:

1. Set invalid CRAFTERS_ROLE_ID in .env
2. Restart bot
3. Player joins server

**Expected Results**:

- ⚠️ Bot logs configuration warning on startup
- ❌ Session notifications disabled automatically
- ✅ Death notifications continue working normally

## Manual Testing Commands

### Check Current Status

```bash
# View active session notifications
node -e "require('./src/database').getActiveSessionNotifications().then(console.log)"

# Check player cooldown status
node -e "require('./src/database').checkSessionCooldown('TestPlayer', 'JOIN').then(console.log)"
```

### Test Notification Formatting

```bash
# Preview JOIN notification embed
node -e "
const { createJoinEmbed } = require('./src/discord');
console.log(JSON.stringify(createJoinEmbed('TestPlayer', new Date()), null, 2));
"

# Preview LEAVE notification embed
node -e "
const { createLeaveEmbed } = require('./src/discord');
console.log(JSON.stringify(createLeaveEmbed('TestPlayer', new Date()), null, 2));
"
```

### Database Cleanup

```bash
# Clean up expired notifications manually
node -e "require('./src/database').cleanupExpiredNotifications().then(count => console.log(`Cleaned ${count} records`))"

# Reset player cooldowns
node -e "require('./src/database').query('DELETE FROM player_session_cooldowns').then(() => console.log('Cooldowns reset'))"
```

## Log File Testing

### Sample Minecraft Log Events

Create test file `test_logs.txt`:

```
[10:30:15] [Server thread/INFO]: TestPlayer joined the game
[10:30:45] [Server thread/INFO]: TestPlayer left the game
[10:31:00] [Server thread/INFO]: TestPlayer joined the game
[10:31:05] [Server thread/INFO]: TestPlayer left the game
[10:33:30] [Server thread/INFO]: TestPlayer joined the game
```

### Run Log Parser Test

```bash
# Process test logs through parser
node -e "
const parser = require('./src/logParser');
const fs = require('fs');
const logs = fs.readFileSync('test_logs.txt', 'utf8').split('\n');
parser.parseLogLines(logs);
"
```

## Troubleshooting Guide

### Issue: No notifications appearing

**Check**:

1. `SESSION_NOTIFICATIONS_ENABLED=true` in .env
2. Bot has permissions in "who-is-on" channel
3. Channel ID is correct (check Discord developer mode)
4. FTP log parsing is working (check console for log events)

### Issue: @Crafters role not mentioned

**Check**:

1. `CRAFTERS_ROLE_ID` matches actual role ID
2. Bot has "Mention Everyone" permission
3. Role is mentionable (Discord role settings)
4. Bot's role is higher than @Crafters role in hierarchy

### Issue: Messages not being deleted

**Check**:

1. Bot has "Manage Messages" permission
2. Messages are not older than 24 hours (Discord limitation)
3. Database contains correct message IDs
4. No errors in console logs

### Issue: Cooldowns not working

**Check**:

1. Database migration completed successfully
2. System time is accurate (cooldowns use server time)
3. No database connection errors
4. `SESSION_COOLDOWN_SECONDS` is positive number

## Performance Monitoring

### Key Metrics to Watch

- **Notification Latency**: Time from log event to Discord post (<5 seconds)
- **Database Response**: Session queries complete in <50ms
- **Memory Usage**: No memory leaks from message tracking
- **Error Rate**: <1% failure rate for notification posting

### Log Monitoring

```bash
# Watch for session notification events
tail -f logs/bot-$(date +%Y-%m-%d).log | grep "Session"

# Monitor cooldown activations
grep "cooldown" logs/bot-$(date +%Y-%m-%d).log

# Track Discord API errors
grep -i "discord.*error" logs/bot-$(date +%Y-%m-%d).log
```

## Success Criteria

### ✅ Feature Working Correctly When:

1. JOIN notifications appear within 5 seconds of log event
2. @Crafters role members receive Discord notifications
3. LEAVE notifications properly delete corresponding JOIN messages
4. Rapid join/leave cycles are rate-limited appropriately
5. Multiple concurrent players are handled without conflicts
6. Bot recovers gracefully from Discord API errors
7. Database maintains consistency under high load
8. Memory usage remains stable during extended operation

### 🔧 Configuration Complete When:

1. All environment variables set correctly
2. Database migration applied successfully
3. Discord permissions configured properly
4. Log file monitoring active and detecting events
5. Error logging functional and informative

This quickstart provides step-by-step validation of the player session notification feature with clear success criteria and troubleshooting guidance.
