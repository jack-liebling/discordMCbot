# Data Model: Minecraft Death Announcements Discord Bot

## Core Entities

### DeathEvent

Represents a single player death incident for Discord announcement.

**Fields**:

- `playerId`: string - Minecraft username of the player who died
- `timestamp`: Date - Exact time when the death occurred
- `cause`: string - Cause of death from server or "died of mysterious causes"
- `experienceLevel`: number - Player's XP level at time of death
- `serverName`: string - Name/identifier of the Minecraft server

**Validation Rules**:

- `playerId` must be non-empty string, max 16 characters (Minecraft username limit)
- `timestamp` must be valid Date object, not future date
- `cause` must be non-empty string, max 256 characters for Discord embed limits
- `experienceLevel` must be non-negative integer
- `serverName` must match configured server identifier

**State Transitions**: Immutable once created (events are facts)

### Player

Represents a Minecraft player with persistent death statistics.

**Fields**:

- `username`: string - Minecraft player username (primary key)
- `totalDeaths`: number - Total number of deaths recorded
- `lastDeathTimestamp`: Date - Timestamp of most recent death (for rate limiting)
- `firstSeen`: Date - When player was first recorded
- `lastUpdated`: Date - When record was last modified

**Validation Rules**:

- `username` must be valid Minecraft username (3-16 chars, alphanumeric + underscore)
- `totalDeaths` must be non-negative integer
- `lastDeathTimestamp` can be null for new players
- `firstSeen` and `lastUpdated` must be valid dates

**Relationships**:

- One Player can have many DeathEvents
- Player.lastDeathTimestamp updated when new DeathEvent created
- Player.totalDeaths incremented for each new DeathEvent

### DiscordChannelConfig

Configuration for Discord announcement channel.

**Fields**:

- `channelId`: string - Discord channel ID for announcements
- `guildId`: string - Discord server/guild ID
- `enabled`: boolean - Whether announcements are active
- `lastMessageId`: string - ID of last announcement message (optional)

**Validation Rules**:

- `channelId` must be valid Discord snowflake ID format
- `guildId` must be valid Discord snowflake ID format
- `enabled` defaults to true
- `lastMessageId` must be valid Discord message ID when present

### RconConfig

Configuration for Minecraft server RCON connection.

**Fields**:

- `host`: string - Minecraft server hostname/IP
- `port`: number - RCON port (default 25575)
- `password`: string - RCON authentication password
- `serverName`: string - Human-readable server identifier
- `pollInterval`: number - Seconds between death checks

**Validation Rules**:

- `host` must be valid hostname or IP address
- `port` must be valid port number (1-65535)
- `password` must be non-empty string
- `serverName` must be non-empty string for display
- `pollInterval` must be positive integer, minimum 1 second

## Data Storage Schema

### players.json

```json
{
  "version": "1.0",
  "lastUpdated": "2025-09-16T10:30:00Z",
  "players": {
    "Steve": {
      "username": "Steve",
      "totalDeaths": 15,
      "lastDeathTimestamp": "2025-09-16T10:25:30Z",
      "firstSeen": "2025-09-10T08:00:00Z",
      "lastUpdated": "2025-09-16T10:25:30Z"
    }
  }
}
```

### config.json

```json
{
  "discord": {
    "channelId": "1234567890123456789",
    "guildId": "9876543210987654321",
    "enabled": true
  },
  "rcon": {
    "host": "minecraft.example.com",
    "port": 25575,
    "serverName": "Friends MC Server",
    "pollInterval": 5
  }
}
```

## Rate Limiting Logic

### Death Event Deduplication

- Check if `currentTimestamp - player.lastDeathTimestamp < 30 seconds`
- If true: ignore death event (don't increment death count or announce)
- If false: process death normally and update lastDeathTimestamp

### Discord Rate Limiting

- Maximum 1 announcement per second across all players
- Queue announcements if multiple deaths occur simultaneously
- Respect Discord API rate limits (50 messages per second per bot)

## Error Handling Scenarios

### Data Corruption Recovery

- Validate JSON schema on load, fallback to empty state if invalid
- Backup previous data file before writing updates
- Graceful degradation with in-memory tracking if file I/O fails

### Missing Player Data

- Auto-create player record on first death with default values
- Handle null/undefined lastDeathTimestamp for new players
- Initialize totalDeaths to 0 for new players

### Invalid Death Data

- Default experienceLevel to 0 if RCON query fails
- Use "died of mysterious causes" for unparseable death messages
- Log invalid data without crashing the bot
