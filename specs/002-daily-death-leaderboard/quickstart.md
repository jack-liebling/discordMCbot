# Quick Start: Daily Death Leaderboard

**Feature**: Daily Death Leaderboard  
**Purpose**: Verify feature implementation through step-by-step testing  
**Prerequisites**: Bot must be running with death announcement feature working

## Setup Verification

### 1. Check Existing Infrastructure

```bash
# Verify bot is running and processing deaths
npm run dev

# Check that players.json exists and has data
cat players.json

# Verify config.json structure
cat config.json
```

**Expected**: Bot starts successfully, existing death tracking works, data files are present.

### 2. Verify Environment Configuration

```bash
# Check required environment variables
echo $DISCORD_TOKEN
echo $DISCORD_CHANNEL_ID
echo $TIMEZONE  # Should be EST or default
```

**Expected**: All required environment variables are set and valid.

## Feature Integration Testing

### 3. Player Activity Tracking

**Test**: Generate player activity to ensure activity tracking works

```bash
# Simulate player activity by triggering death events
# (This tests that lastSeenTimestamp gets updated)
```

**Manual verification**:

1. Cause a player death on the Minecraft server
2. Check that death announcement appears in Discord
3. Verify `players.json` now includes `lastSeenTimestamp` field

**Expected**: Player records show updated `lastSeenTimestamp` after death events.

### 4. Leaderboard Generation (Manual)

**Test**: Generate leaderboard manually to verify core functionality

```typescript
// Add to bot for testing (temporary code)
import { LeaderboardService } from "./leaderboardService";

const leaderboardService = new LeaderboardService();
const leaderboard = await leaderboardService.generateLeaderboard();
console.log(JSON.stringify(leaderboard, null, 2));
```

**Expected Output**:

```json
{
  "generatedAt": "2025-09-17T23:59:00.000Z",
  "totalPlayers": 3,
  "leaderboard": [
    {
      "rank": 1,
      "username": "ClumsySteve",
      "totalDeaths": 15,
      "isActive": true
    },
    {
      "rank": 2,
      "username": "Alex",
      "totalDeaths": 8,
      "isActive": false
    }
  ],
  "survivalChampion": {
    "username": "ProPlayer",
    "timeAliveMs": 259200000,
    "formattedTimeAlive": "3 days"
  }
}
```

### 5. Discord Embed Formatting

**Test**: Verify embed appears correctly in Discord

```typescript
// Manual embed generation test
import { LeaderboardFormatter } from "./leaderboardFormatter";

const formatter = new LeaderboardFormatter();
const embed = formatter.createLeaderboardEmbed(testLeaderboard);
// Send to Discord channel for visual verification
```

**Expected**: Discord embed displays with proper formatting, emojis, and readable content.

### 6. Scheduling System

**Test**: Verify daily scheduling without waiting for 11:59 PM

```typescript
// Temporarily modify announcement time for testing
const testScheduler = new SchedulerService();
// Override isAnnouncementTime() to return true
testScheduler.triggerAnnouncement();
```

**Expected**: Leaderboard announcement appears in Discord channel immediately.

## End-to-End Workflow Test

### 7. Complete Daily Cycle Simulation

**Scenario**: Simulate a complete daily announcement cycle

**Steps**:

1. Ensure bot has been running and tracking deaths
2. Set system clock or modify code to trigger at announcement time
3. Verify announcement appears automatically
4. Check that `config.json` is updated with `lastAnnouncementDate`
5. Confirm no duplicate announcements occur

**Expected Timeline**:

- T+0: Bot detects announcement time (11:59 PM EST)
- T+5s: Leaderboard generated from current player data
- T+10s: Discord embed formatted and sent
- T+15s: Configuration updated to prevent duplicate

### 8. Edge Case Testing

#### Empty Leaderboard

**Test**: What happens when no players have died?

```bash
# Backup players.json
cp players.json players.json.backup

# Create empty player data
echo '{"version":"1.1.0","lastUpdated":"2025-09-17T23:59:00.000Z","players":{}}' > players.json

# Trigger announcement
```

**Expected**: "No deaths recorded yet - everyone is surviving! 🎉" message appears.

#### Inactive Players Only

**Test**: All players inactive for over 7 days

```typescript
// Modify all player lastSeenTimestamp to be >7 days ago
// Trigger announcement
```

**Expected**: Leaderboard shows players but no survival champion.

#### Tie Breaker

**Test**: Multiple players with same death count

```json
// Set multiple players to same totalDeaths in players.json
{
  "player1": { "username": "Zed", "totalDeaths": 5 },
  "player2": { "username": "Alpha", "totalDeaths": 5 }
}
```

**Expected**: Alphabetical ordering (Alpha before Zed).

## Configuration Validation

### 9. Persistent State

**Test**: Bot restart maintains schedule state

**Steps**:

1. Run bot, wait for successful announcement
2. Stop bot (`Ctrl+C`)
3. Check `config.json` contains `leaderboard.lastAnnouncementDate`
4. Restart bot
5. Verify no duplicate announcement occurs

**Expected**: Bot remembers last announcement date across restarts.

### 10. Configuration Recovery

**Test**: Graceful handling of missing/corrupt config

**Steps**:

1. Remove `leaderboard` section from `config.json`
2. Restart bot
3. Check bot adds default leaderboard configuration

**Expected**: Bot creates default leaderboard config and continues operating.

## Performance Validation

### 11. Load Testing (Friend Group Scale)

**Test**: Performance with realistic player count

**Setup**: Create test data with 20 players, varying death counts

```typescript
// Generate 20 test players with random death counts 1-50
// Trigger leaderboard generation
// Measure generation time
```

**Expected**: Leaderboard generation completes in <50ms.

### 12. Memory Usage

**Test**: Monitor memory usage during operation

```bash
# Monitor memory before and after leaderboard generation
node --expose-gc index.js
# Check process memory usage
```

**Expected**: Memory increase <1MB during leaderboard generation.

## Success Criteria Checklist

- [ ] Bot automatically announces leaderboard at 11:59 PM EST
- [ ] Leaderboard shows all players ranked by death count (ascending)
- [ ] Tied death counts sorted alphabetically by username
- [ ] Survival champion shows longest-surviving active player
- [ ] Inactive players (>7 days) excluded from survival champion
- [ ] Discord embed displays with proper formatting and emojis
- [ ] No duplicate announcements on same date
- [ ] Bot remembers announcement state across restarts
- [ ] Graceful handling of edge cases (no deaths, all inactive)
- [ ] Performance meets requirements (<50ms generation)

## Rollback Plan

If issues occur during testing:

1. **Stop scheduler**: Disable daily announcements
2. **Revert data changes**: Restore `players.json` backup
3. **Remove leaderboard config**: Delete from `config.json`
4. **Verify core functionality**: Ensure death announcements still work

## Next Steps After Success

1. Monitor first few daily announcements for accuracy
2. Gather feedback from friend group on format/timing
3. Consider optional enhancements based on usage patterns
