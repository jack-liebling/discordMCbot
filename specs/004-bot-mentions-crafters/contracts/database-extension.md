# Database Extension Contract

**Component**: Database Service  
**Extension**: Session notification state tracking and cooldown management

## Schema Extension

### New Table: `player_session_notifications`

```sql
CREATE TABLE player_session_notifications (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) NOT NULL,
  notification_type VARCHAR(10) NOT NULL CHECK (notification_type IN ('JOIN', 'LEAVE')),
  discord_message_id VARCHAR(20), -- Discord snowflake ID
  discord_channel_id VARCHAR(20) NOT NULL,
  discord_guild_id VARCHAR(20) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP WITH TIME ZONE, -- For automatic cleanup

  INDEX idx_username_type (username, notification_type),
  INDEX idx_expires_at (expires_at),
  INDEX idx_discord_message (discord_message_id)
);
```

### New Table: `player_session_cooldowns`

```sql
CREATE TABLE player_session_cooldowns (
  username VARCHAR(50) PRIMARY KEY,
  last_join_at TIMESTAMP WITH TIME ZONE,
  last_leave_at TIMESTAMP WITH TIME ZONE,
  cooldown_until TIMESTAMP WITH TIME ZONE,
  consecutive_events INTEGER DEFAULT 0,

  INDEX idx_cooldown_until (cooldown_until),
  INDEX idx_last_activity (last_join_at, last_leave_at)
);
```

## Extension Interface

### New Methods

#### `recordSessionNotification(data: SessionNotificationData): Promise<NotificationRecord>`

**Purpose**: Store session notification with Discord message reference  
**Parameters**:

```typescript
interface SessionNotificationData {
  username: string;
  type: "JOIN" | "LEAVE";
  discordMessageId: string;
  discordChannelId: string;
  discordGuildId: string;
  expiresAt?: Date; // Default: 24 hours from now
}
```

**Returns**: `NotificationRecord` with database ID and metadata
**Throws**: `DatabaseError` if insertion fails

#### `findActiveJoinNotification(username: string, channelId: string): Promise<NotificationRecord | null>`

**Purpose**: Find active JOIN notification for LEAVE event deletion  
**Parameters**:

- `username`: Player username
- `channelId`: Discord channel ID

**Returns**: Active JOIN notification record or null if not found

#### `markNotificationDeleted(notificationId: number): Promise<boolean>`

**Purpose**: Mark notification as deleted (set discord_message_id to null)  
**Parameters**:

- `notificationId`: Database record ID

**Returns**: `true` if update successful

#### `cleanupExpiredNotifications(): Promise<number>`

**Purpose**: Remove expired notification records (automated cleanup)  
**Returns**: Number of records deleted

### Cooldown Management

#### `checkSessionCooldown(username: string, eventType: 'JOIN' | 'LEAVE'): Promise<CooldownStatus>`

**Purpose**: Check if player is in cooldown period  
**Parameters**:

- `username`: Player username
- `eventType`: Type of session event

**Returns**:

```typescript
interface CooldownStatus {
  inCooldown: boolean;
  remainingSeconds: number;
  consecutiveEvents: number;
  lastEventAt: Date | null;
}
```

#### `updateSessionCooldown(username: string, eventType: 'JOIN' | 'LEAVE'): Promise<void>`

**Purpose**: Update cooldown state after session event  
**Parameters**:

- `username`: Player username
- `eventType`: Type of session event

**Side Effects**: Updates cooldown_until based on consecutive events

### Query Interface

#### `getActiveSessionNotifications(channelId?: string): Promise<NotificationRecord[]>`

**Purpose**: Get all active (non-deleted) session notifications  
**Parameters**:

- `channelId`: Optional filter by Discord channel

**Returns**: Array of active notification records

#### `getPlayerSessionHistory(username: string, limit: number = 50): Promise<SessionHistoryRecord[]>`

**Purpose**: Get recent session activity for player  
**Parameters**:

- `username`: Player username
- `limit`: Maximum records to return

**Returns**: Chronologically ordered session events

## Data Model Contracts

### NotificationRecord

```typescript
interface NotificationRecord {
  id: number;
  username: string;
  type: "JOIN" | "LEAVE";
  discordMessageId: string | null; // null if deleted
  discordChannelId: string;
  discordGuildId: string;
  createdAt: Date;
  expiresAt: Date;
  isDeleted: boolean; // computed: discordMessageId === null
}
```

### SessionHistoryRecord

```typescript
interface SessionHistoryRecord {
  username: string;
  type: "JOIN" | "LEAVE";
  timestamp: Date;
  discordChannelId: string;
  messagePosted: boolean; // false if in cooldown
}
```

### CooldownRule

```typescript
interface CooldownRule {
  baseSeconds: number; // 120 seconds (2 minutes)
  maxSeconds: number; // 600 seconds (10 minutes)
  escalationFactor: number; // 1.5x per consecutive event
  resetAfterMinutes: number; // 30 minutes of inactivity resets
}
```

## Business Logic Contract

### Cooldown Calculation

```typescript
const calculateCooldown = (
  consecutiveEvents: number,
  baseSeconds: number = 120
): number => {
  if (consecutiveEvents <= 1) return 0; // First event, no cooldown

  const escalated = baseSeconds * Math.pow(1.5, consecutiveEvents - 2);
  return Math.min(escalated, 600); // Cap at 10 minutes
};
```

### Consecutive Event Detection

- **Same Event Type**: Multiple JOINs or LEAVEs within 30 minutes = consecutive
- **Alternating Events**: JOIN→LEAVE→JOIN within 5 minutes = consecutive
- **Reset Conditions**: 30 minutes of no activity resets consecutive counter

### Expiration Policy

- **Notification Records**: Expire after 24 hours (automatic cleanup)
- **Cooldown Records**: Expire after 7 days of inactivity
- **History Retention**: Keep session history for 30 days

## Validation Requirements

### Input Validation

- Usernames: 3-50 characters, alphanumeric + underscore only
- Discord IDs: Valid snowflake format (18-19 digits)
- Timestamps: Valid Date objects, not future-dated
- Event types: Must be exactly 'JOIN' or 'LEAVE'

### Data Integrity

- Foreign key constraints where applicable
- Check constraints on enum values
- Proper indexing for query performance
- Automated cleanup of orphaned records

### Concurrent Access

- Transaction isolation for cooldown updates
- Atomic read-modify-write for consecutive event counting
- Deadlock prevention in multi-table operations

## Performance Contract

### Query Performance

- Session notification lookups complete in <50ms
- Cooldown checks complete in <25ms
- Bulk cleanup operations complete in <5 seconds
- All queries use appropriate indexes

### Storage Efficiency

- Automatic cleanup of expired records
- Efficient indexing strategy for common queries
- Minimal storage overhead for tracking data

### Concurrent Operations

- Support for multiple session events processed simultaneously
- No blocking operations in notification recording
- Transaction timeouts prevent deadlocks

## Error Handling Contract

### Database Errors

- **Connection Loss**: Retry with exponential backoff (max 3 attempts)
- **Constraint Violations**: Log error, return meaningful error codes
- **Deadlocks**: Automatic retry with random delay

### Data Consistency

- **Partial Failures**: Rollback transactions, maintain consistency
- **Orphaned Records**: Cleanup jobs handle dangling references
- **Corruption Detection**: Validate data integrity on startup

### Fallback Behavior

```typescript
interface DatabaseFallback {
  enableJsonFallback: boolean; // Fall back to JSON storage if DB unavailable
  jsonPath: string; // Local file path for fallback storage
  syncOnReconnect: boolean; // Sync JSON data back to DB when available
}
```

## Migration Contract

### Database Migration: `004-session-notifications.sql`

```sql
-- Add session notification tables
-- Add indexes for performance
-- Set up automated cleanup triggers
-- Migrate existing player data if needed
```

### Backward Compatibility

- Existing player and death tracking tables unchanged
- New tables are independent additions
- No breaking changes to existing queries
- Graceful degradation if new tables not available

## Testing Contract

### Unit Tests Required

- Session notification CRUD operations
- Cooldown calculation logic
- Consecutive event detection
- Expiration and cleanup functionality

### Integration Tests Required

- End-to-end notification lifecycle (create→find→delete)
- Cooldown enforcement across multiple events
- Database migration and rollback
- Concurrent session event processing

### Performance Tests Required

- 1000 session events processed in <30 seconds
- Cleanup of 10,000 expired records in <5 seconds
- Cooldown checks under high concurrency
- Memory usage remains stable during extended operation
