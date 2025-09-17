# Data Model: Player Online Notifications

**Date**: September 17, 2025  
**Feature**: Player Online Notifications with Crafters Role Mentions

## Core Entities

### PlayerSessionState

Tracks player online/offline status with cooldown enforcement.

**Fields**:

- `username: string` - Player username (primary key)
- `is_online: boolean` - Current online status
- `last_join_timestamp: Date` - When player last joined server
- `last_leave_timestamp: Date` - When player last left server
- `last_notification_action: Date` - When bot last took notification action
- `notification_message_id: string | null` - Discord message ID for current notification
- `created_at: Date` - Record creation timestamp
- `updated_at: Date` - Record last update timestamp

**Validation Rules**:

- Username must be non-empty string, max 16 characters (Minecraft limit)
- Timestamps must be valid dates, not in future
- Message ID must be valid Discord snowflake format when present
- Last notification action must respect 2-minute minimum interval

**State Transitions**:

```
OFFLINE (no notification)
  → [player joins + cooldown passed] →
ONLINE (JOIN notification posted)
  → [player leaves] →
DELETING (2-minute timer started)
  → [timer expires] →
OFFLINE (notification deleted)
```

### NotificationMessage

Tracks Discord messages posted for player notifications.

**Fields**:

- `id: bigserial` - Primary key
- `username: string` - Player this notification is for
- `message_id: string` - Discord message snowflake ID
- `channel_id: string` - Discord channel where message was posted
- `posted_at: Date` - When notification was posted
- `delete_scheduled_at: Date | null` - When message is scheduled for deletion
- `status: 'active' | 'scheduled_for_deletion' | 'deleted' | 'failed'` - Message lifecycle status

**Relationships**:

- One-to-one with PlayerSessionState (via username)
- Foreign key constraint to ensure referential integrity

**Validation Rules**:

- Message ID and channel ID must be valid Discord snowflakes
- Status must be one of allowed enum values
- Posted timestamp must not be in future
- Delete scheduled timestamp must be after posted timestamp

### SessionCooldown

Enforces 2-minute minimum between JOIN notification posts per player.

**Fields**:

- `username: string` - Player username (primary key)
- `last_join_notification: Date` - When last JOIN notification was posted
- `cooldown_expires_at: Date` - When player can have next JOIN notification

**Business Rules**:

- Cooldown period is exactly 2 minutes (120 seconds) from last JOIN notification
- Only applies to posting new JOIN notifications, not deletion
- Prevents spam from rapid join/leave/rejoin cycles
- Cooldown resets after successful JOIN notification posting
- Independent cooldowns per player (no global effects)

## Database Schema Extensions

### New Table: player_session_notifications

```sql
CREATE TABLE player_session_notifications (
    username VARCHAR(255) PRIMARY KEY,
    is_online BOOLEAN NOT NULL DEFAULT false,
    last_join_timestamp TIMESTAMPTZ,
    last_leave_timestamp TIMESTAMPTZ,
    notification_message_id VARCHAR(255),
    delete_scheduled_at TIMESTAMPTZ,
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'scheduled_for_deletion', 'deleted', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Foreign key to existing players table
    CONSTRAINT fk_session_player
        FOREIGN KEY (username)
        REFERENCES players(username)
        ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX idx_session_online ON player_session_notifications (is_online);
CREATE INDEX idx_session_status ON player_session_notifications (status);
CREATE INDEX idx_session_delete_scheduled ON player_session_notifications (delete_scheduled_at);
CREATE INDEX idx_session_message ON player_session_notifications (notification_message_id);
```

### New Table: player_session_cooldowns

```sql
CREATE TABLE player_session_cooldowns (
    username VARCHAR(255) PRIMARY KEY,
    last_join_notification TIMESTAMPTZ,
    cooldown_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Foreign key to existing players table
    CONSTRAINT fk_cooldown_player
        FOREIGN KEY (username)
        REFERENCES players(username)
        ON DELETE CASCADE
);

-- Index for cooldown queries
CREATE INDEX idx_cooldown_expires ON player_session_cooldowns (cooldown_expires_at);
```

```

## Entity Relationships

```

players (existing)
↓ (1:1 optional)
player_session_notifications
↓ (1:1 optional)  
Discord Message (external)

```

**Key Relationships**:
- Each player can have at most one active session notification
- Session state is optional (only created when first JOIN detected)
- Discord messages are external entities tracked by ID only
- Cooldown enforcement prevents rapid state changes

## Data Flow

### JOIN Event Flow
```

1. Log parser detects JOIN event
2. Check if player exists in session table
3. If not exists OR cooldown expired:
   - Update session state (online=true, timestamps)
   - Post Discord notification
   - Store message ID in session record
4. If within cooldown: ignore event

```

### LEAVE Event Flow
```

1. Log parser detects LEAVE event
2. Check session state and cooldown
3. If online AND cooldown expired:
   - Delete Discord notification message
   - Update session state (online=false, clear message_id)
4. If within cooldown: ignore event

```

## Migration Strategy

**Phase 1**: Add new table with foreign key to existing players table
**Phase 2**: Populate initial state for any currently tracked players
**Phase 3**: Integrate with existing log parser and activity tracking

**Rollback Plan**: Drop new table, no impact on existing functionality

## Performance Considerations

- Indexes on frequently queried fields (online status, cooldown timestamps)
- Session table size limited by active player count (~10-20 records max)
- Discord API rate limits respected (max 50 requests per second)
- Database operations are lightweight (simple CRUD on small dataset)
```
