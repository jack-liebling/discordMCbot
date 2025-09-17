# Data Model: Daily Death Leaderboard

**Feature**: Daily Death Leaderboard  
**Date**: September 17, 2025  
**Dependencies**: Extends existing Player and ConfigData interfaces

## Entity Definitions

### Extended Player Interface

Extends existing `Player` interface with activity tracking:

```typescript
export interface Player {
  username: string;
  totalDeaths: number;
  lastDeathTimestamp: Date | null;
  firstSeen: Date;
  lastUpdated: Date;
  lastSeenTimestamp: Date; // NEW: Track player activity for 7-day window
}
```

**New Field**:

- `lastSeenTimestamp`: Updated whenever player appears in any log entry (death, join, advancement)
- Used to determine eligibility for survival champion (must be within 7 days)

### Daily Leaderboard Data Structure

Runtime data structure for leaderboard generation:

```typescript
export interface DailyLeaderboard {
  generatedAt: Date;
  totalPlayers: number;
  leaderboard: LeaderboardEntry[];
  survivalChampion: SurvivalChampion | null;
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  totalDeaths: number;
  isActive: boolean; // Within 7-day activity window
}

export interface SurvivalChampion {
  username: string;
  timeAliveMs: number;
  lastDeathTimestamp: Date | null;
  formattedTimeAlive: string; // Human-readable format
}
```

### Extended Configuration Schema

Extends existing `ConfigData` to track leaderboard scheduling:

```typescript
export interface ConfigData {
  discord: DiscordChannelConfig;
  logState?: LogProcessingState;
  leaderboard?: LeaderboardConfig; // NEW: Daily scheduling state
}

export interface LeaderboardConfig {
  lastAnnouncementDate: string; // ISO date string (YYYY-MM-DD)
  enabled: boolean;
  timezone: string; // Default: "EST"
  announcementTime: string; // Default: "23:59"
}
```

## Data Relationships

### Player Activity Flow

```
Log Entry (any type) → Update lastSeenTimestamp → Activity Eligibility Check
                                                        ↓
                                        Survival Champion Calculation
```

### Daily Generation Flow

```
Scheduled Time (11:59 PM EST)
    ↓
Load All Players → Filter Active (7 days) → Generate Leaderboard
    ↓                      ↓                       ↓
Sort by Deaths → Calculate Survival Champion → Format Discord Embed
    ↓
Update lastAnnouncementDate → Send to Discord
```

## Validation Rules

### Player Data Validation

- `lastSeenTimestamp` must not be in the future
- `lastSeenTimestamp` should be >= `firstSeen`
- Activity window: 7 days = 604,800,000 milliseconds

### Leaderboard Generation Rules

- **Ranking**: Primary by `totalDeaths` (ascending), secondary by `username` (alphabetical)
- **Activity Filter**: Only players with `lastSeenTimestamp` within 7 days eligible for survival champion
- **Survival Calculation**: Current time minus `lastDeathTimestamp` (if null, use `firstSeen`)

### Configuration Validation

- `lastAnnouncementDate` must be valid ISO date string
- `announcementTime` must be valid HH:MM format
- Prevent duplicate announcements on same date

## State Transitions

### Player State Updates

```
Player Activity Event → Update lastSeenTimestamp → Persist to players.json
Death Event → Update totalDeaths + lastDeathTimestamp + lastSeenTimestamp
```

### Daily Announcement State

```
Daily Timer Trigger → Check lastAnnouncementDate
    ↓
Generate Leaderboard → Send Discord Message → Update lastAnnouncementDate
```

## Storage Schema Changes

### players.json Extension

```json
{
  "version": "1.1.0",
  "lastUpdated": "2025-09-17T23:59:00.000Z",
  "players": {
    "player123": {
      "username": "Steve",
      "totalDeaths": 5,
      "lastDeathTimestamp": "2025-09-15T14:30:00.000Z",
      "firstSeen": "2025-09-01T10:00:00.000Z",
      "lastUpdated": "2025-09-17T18:45:00.000Z",
      "lastSeenTimestamp": "2025-09-17T18:45:00.000Z"
    }
  }
}
```

### config.json Extension

```json
{
  "discord": {
    "channelId": "123456789",
    "guildId": "987654321",
    "enabled": true
  },
  "logState": {
    "lastProcessedPosition": 12345,
    "lastProcessedTimestamp": "2025-09-17T18:45:00.000Z",
    "lastUpdateTime": "2025-09-17T18:45:30.000Z"
  },
  "leaderboard": {
    "lastAnnouncementDate": "2025-09-17",
    "enabled": true,
    "timezone": "EST",
    "announcementTime": "23:59"
  }
}
```

## Migration Strategy

### Backward Compatibility

- Existing `Player` records get `lastSeenTimestamp` = `lastUpdated` on first load
- Missing `leaderboard` config gets default values
- Graceful handling of missing fields during JSON parsing

### Data Integrity

- Validate all timestamps during load
- Default values for corrupted data
- Preserve existing functionality if leaderboard data is invalid

## Performance Considerations

### Memory Usage

- Additional 8 bytes per player for `lastSeenTimestamp`
- Temporary leaderboard arrays during generation (~1KB for 20 players)
- Negligible impact on existing file-based storage

### Processing Efficiency

- Daily generation: O(n log n) for sorting ~20 players
- Activity filtering: O(n) single pass
- Survival calculation: O(n) single pass among active players

**Estimated total processing time**: <10ms for friend group scale
