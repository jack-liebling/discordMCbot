# Quickstart: Enhanced Player Activity Tracking

**Feature**: Enhanced Player Activity Tracking  
**Date**: September 17, 2025  
**Estimated Time**: 15 minutes

## Overview

This quickstart guide validates that the enhanced player activity tracking system correctly monitors, parses, and stores all player activities from Minecraft server logs beyond just deaths.

## Prerequisites

- Discord bot is running and connected
- FTP access to Minecraft server logs is configured
- PostgreSQL database is accessible (Railway deployment)
- At least one Minecraft player available for testing

## Test Scenario: Complete Activity Lifecycle

### Step 1: Verify Initial State (2 minutes)

**Action**: Check current system state before testing

```bash
# Check bot is running
npm run build
npm start

# Verify database connection
# Bot should log: "Database initialized successfully"

# Check current player data
# Look for log: "Loaded X players from database"
```

**Expected Result**:

- Bot starts without errors
- Database connection established
- Existing player data loaded (if any)

### Step 2: Player Join Activity (3 minutes)

**Action**: Have a player join the Minecraft server

**What to Monitor**:

- FTP log polling detects new log entries
- Join activity is parsed from log pattern: `{Player} joined the game`
- Database receives new activity record

**Expected Log Output**:

```
[INFO] New activity detected: {Player} JOIN at {timestamp}
[INFO] Activity recorded: JOIN for {Player}
[INFO] Player {Player} last seen updated
```

**Validation**:

- Player record exists in `players` table
- New record in `player_activities` table with `activity_type = 'JOIN'`
- Activity timestamp matches log timestamp
- Metadata includes coordinates and login details if available

### Step 3: Chat Activity (2 minutes)

**Action**: Have the player send a chat message in Minecraft

**What to Monitor**:

- Chat message pattern detected: `<{Player}> {message}`
- Chat activity recorded with message length metadata

**Expected Log Output**:

```
[INFO] New activity detected: {Player} CHAT at {timestamp}
[INFO] Activity recorded: CHAT for {Player}
```

**Validation**:

- New `player_activities` record with `activity_type = 'CHAT'`
- Metadata contains `message_length` field
- Original message content is NOT stored (privacy compliance)
- Rate limiting allows rapid chat messages (1-second limit)

### Step 4: Achievement Activity (3 minutes)

**Action**: Have the player unlock an advancement (craft pickaxe, kill mob, etc.)

**What to Monitor**:

- Achievement pattern detected: `{Player} has made the advancement [{AdvancementName}]`
- Achievement activity recorded with advancement details

**Expected Log Output**:

```
[INFO] New activity detected: {Player} ACHIEVEMENT at {timestamp}
[INFO] Activity recorded: ACHIEVEMENT for {Player} - {AdvancementName}
```

**Validation**:

- New `player_activities` record with `activity_type = 'ACHIEVEMENT'`
- Metadata contains `advancement_name` field with correct advancement
- Achievement categorization applied (mining, combat, etc.)

### Step 5: Death Activity (2 minutes)

**Action**: Have the player die in Minecraft (fall damage, drowning, etc.)

**What to Monitor**:

- Death pattern detected: `{Player} {cause of death}`
- Death activity recorded (existing functionality enhanced)
- Player death count incremented

**Expected Log Output**:

```
[INFO] New activity detected: {Player} DEATH at {timestamp}
[INFO] Activity recorded: DEATH for {Player} - {cause}
[INFO] Player {Player} death count: {count}
```

**Validation**:

- New `player_activities` record with `activity_type = 'DEATH'`
- Existing `players.total_deaths` incremented
- Death cause captured in metadata
- Rate limiting prevents duplicate death within 30 seconds

### Step 6: Player Leave Activity (3 minutes)

**Action**: Have the player disconnect from the server

**What to Monitor**:

- Leave pattern detected: `{Player} left the game`
- Leave activity recorded
- Session duration calculated if possible

**Expected Log Output**:

```
[INFO] New activity detected: {Player} LEAVE at {timestamp}
[INFO] Activity recorded: LEAVE for {Player}
[INFO] Session duration calculated: {duration} ms
```

**Validation**:

- New `player_activities` record with `activity_type = 'LEAVE'`
- Session duration calculated from JOIN to LEAVE time
- Player `last_seen_timestamp` updated
- Disconnect reason captured if available

## Validation Queries

### Database Verification

Run these queries to verify data integrity:

```sql
-- Check all activities for test player
SELECT
  activity_type,
  timestamp,
  metadata
FROM player_activities
WHERE username = '{TestPlayer}'
ORDER BY timestamp;

-- Verify session calculation
WITH sessions AS (
  SELECT
    activity_type,
    timestamp,
    LAG(timestamp) OVER (ORDER BY timestamp) as prev_timestamp,
    LAG(activity_type) OVER (ORDER BY timestamp) as prev_activity
  FROM player_activities
  WHERE username = '{TestPlayer}'
    AND activity_type IN ('JOIN', 'LEAVE')
  ORDER BY timestamp
)
SELECT
  timestamp,
  prev_timestamp,
  EXTRACT(epoch FROM (timestamp - prev_timestamp)) * 1000 as session_duration_ms
FROM sessions
WHERE activity_type = 'LEAVE' AND prev_activity = 'JOIN';

-- Check activity breakdown
SELECT
  activity_type,
  COUNT(*) as count,
  MIN(timestamp) as first_activity,
  MAX(timestamp) as last_activity
FROM player_activities
WHERE username = '{TestPlayer}'
GROUP BY activity_type;
```

### Expected Results

After completing all steps, you should see:

```
activity_type | count | first_activity        | last_activity
--------------|-------|----------------------|----------------------
JOIN          |     1 | 2025-09-17 16:34:58  | 2025-09-17 16:34:58
CHAT          |     1 | 2025-09-17 16:35:30  | 2025-09-17 16:35:30
ACHIEVEMENT   |     1 | 2025-09-17 16:36:15  | 2025-09-17 16:36:15
DEATH         |     1 | 2025-09-17 16:37:45  | 2025-09-17 16:37:45
LEAVE         |     1 | 2025-09-17 16:38:12  | 2025-09-17 16:38:12
```

## Error Scenarios to Test

### Rate Limiting Validation

**Test**: Have player perform same activity rapidly

```bash
# Player joins and leaves quickly multiple times
# Expected: Only first JOIN within 10-second window recorded
# Subsequent JOINs within window should be rate-limited
```

**Expected Log Output**:

```
[WARN] Rate limit exceeded for {Player} JOIN activity
[DEBUG] Skipping duplicate activity within rate limit window
```

### Invalid Log Format Handling

**Test**: Monitor behavior with malformed log entries

**Expected Behavior**:

- Invalid lines are skipped without crashing
- Warning logged for unparseable lines
- Processing continues with next valid line

### Database Fallback Validation

**Test**: Temporarily disconnect database (if possible in test environment)

**Expected Behavior**:

- System falls back to JSON file storage
- Activities continue to be recorded locally
- Error logged about database unavailability
- System recovers when database reconnects

## Performance Validation

### Activity Processing Speed

**Test**: Generate rapid activity bursts

**Expected Performance**:

- Each log line processed in <1ms
- No memory leaks during extended operation
- FTP polling maintains 10-second interval
- Database writes complete within 100ms

### Concurrent Player Handling

**Test**: Multiple players active simultaneously

**Expected Behavior**:

- Activities from multiple players processed correctly
- No race conditions in database writes
- Player session calculations remain accurate
- System remains responsive

## Success Criteria

✅ **All Activity Types Detected**: JOIN, LEAVE, CHAT, ACHIEVEMENT, DEATH  
✅ **Database Storage Working**: All activities persisted to PostgreSQL  
✅ **Rate Limiting Functional**: Duplicate activities properly filtered  
✅ **Session Calculation Accurate**: JOIN/LEAVE pairs correctly matched  
✅ **Error Handling Graceful**: Invalid data doesn't crash system  
✅ **Performance Acceptable**: <1ms per log line processing  
✅ **Fallback System Working**: JSON storage available if database fails

## Troubleshooting

### Common Issues

**Issue**: Activities not detected

- **Check**: FTP connection to log file
- **Check**: Log file format matches expected patterns
- **Check**: Player names don't contain special characters

**Issue**: Database connection errors

- **Check**: DATABASE_URL environment variable
- **Check**: Railway PostgreSQL instance status
- **Check**: Network connectivity to database

**Issue**: Rate limiting too aggressive

- **Check**: Rate limit configuration in code
- **Check**: System clock accuracy
- **Check**: Activity timestamps in database

**Issue**: Session calculation incorrect

- **Check**: JOIN/LEAVE activity pairing logic
- **Check**: Server restart handling
- **Check**: Orphaned activity handling

### Debug Commands

```bash
# Enable debug logging
export LOG_LEVEL=debug
npm start

# Check database state
export DATABASE_URL="your_railway_url"
psql $DATABASE_URL -c "SELECT * FROM player_activities ORDER BY timestamp DESC LIMIT 10;"

# Monitor log processing
tail -f logs/bot-$(date +%Y-%m-%d).log | grep "Activity"
```

## Next Steps

After successful validation:

1. **Enable Production Mode**: Remove debug logging, optimize performance
2. **Configure Retention**: Set up activity cleanup policies for long-term storage
3. **Build Analytics**: Use activity data for enhanced leaderboards and statistics
4. **Monitor Performance**: Track system performance with multiple active players
5. **Extend Features**: Consider additional activity types or enhanced metadata

This quickstart validates that the enhanced player activity tracking system correctly implements all requirements from the specification and integrates seamlessly with the existing Discord bot infrastructure.
