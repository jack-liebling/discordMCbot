# Session Notification Service Contract

**Service**: SessionNotificationService  
**Purpose**: Manage Discord notification lifecycle for player JOIN/LEAVE events

## Interface Definition

### Core Methods

#### `handlePlayerJoin(username: string, timestamp: Date): Promise<void>`

**Purpose**: Process player join event and potentially post notification  
**Preconditions**:

- Username is valid Minecraft username (non-empty, ≤16 chars)
- Timestamp is valid and not in future

**Behavior**:

- Check if player has active cooldown for JOIN notifications (< 2 minutes since last JOIN notification)
- If cooldown active: log and return (no notification posted)
- If cooldown expired or first join:
  - Post green JOIN Discord notification to "who-is-on" channel with @Crafters mention
  - Store message ID and update session state
  - Update cooldown timestamp

**Postconditions**:

- Player session state updated with online=true
- Discord JOIN message posted (if cooldown allows)
- Cooldown timer reset for JOIN notifications
- Message ID stored for later deletion

**Error Handling**:

- Discord API failures: log error, continue (don't crash bot)
- Database failures: log error, attempt retry once
- Invalid username: log warning, return early

#### `handlePlayerLeave(username: string, timestamp: Date): Promise<void>`

**Purpose**: Process player leave event and schedule notification deletion  
**Preconditions**:

- Username corresponds to existing session
- Timestamp is valid and not in future

**Behavior**:

- Check if player has active JOIN notification message
- If message exists:
  - Schedule message deletion for 2 minutes from now (using setTimeout)
  - Update session state to 'scheduled_for_deletion'
  - Store deletion timestamp in database

**Postconditions**:

- Player session state updated with online=false
- Message marked as scheduled for deletion
- Timer set to delete message in 2 minutes
- Database updated with scheduled deletion time

**Error Handling**:

- Message not found: log warning, update session state anyway
- Discord API failures: log error, mark session offline anyway
- Database failures: log error, attempt retry once

#### `getPlayerSessionState(username: string): Promise<PlayerSessionState | null>`

**Purpose**: Retrieve current session state for a player  
**Returns**: Session state object or null if no session exists
**Error Handling**: Database errors logged and re-thrown

#### `cleanup(): Promise<void>`

**Purpose**: Clean up stale sessions and orphaned messages  
**Behavior**:

- Find messages older than 24 hours with no corresponding online player
- Attempt to delete orphaned Discord messages
- Remove stale session records

## Internal Dependencies

### Discord Client Integration

```typescript
interface DiscordNotificationClient {
  postNotification(channelId: string, content: string): Promise<string>; // returns message ID
  deleteMessage(channelId: string, messageId: string): Promise<void>;
  getRoleId(roleName: string): Promise<string | null>;
}
```

### Database Integration

```typescript
interface SessionDatabase {
  getSessionState(username: string): Promise<PlayerSessionState | null>;
  updateSessionState(
    username: string,
    state: Partial<PlayerSessionState>
  ): Promise<void>;
  createSessionState(
    username: string,
    initialState: PlayerSessionState
  ): Promise<void>;
}
```

### Rate Limiting Integration

```typescript
interface SessionCooldownManager {
  isActionAllowed(username: string, actionType: "join" | "leave"): boolean;
  recordAction(
    username: string,
    actionType: "join" | "leave",
    timestamp: Date
  ): void;
  getRemainingCooldown(username: string): number; // seconds
}
```

## Configuration Requirements

### Environment Variables

- `DISCORD_WHO_IS_ON_CHANNEL_ID`: Discord channel ID for notifications
- `CRAFTERS_ROLE_NAME`: Role name to mention (default: "Crafters")
- `SESSION_COOLDOWN_MINUTES`: Cooldown period (default: 2)

### Channel Configuration

- Bot must have permissions to post and delete messages in target channel
- Bot must have permission to mention the Crafters role
- Channel must exist and be accessible

## Error Recovery Patterns

### Discord API Rate Limiting

- Implement exponential backoff for rate limit responses
- Queue messages if rate limited, process when limit resets
- Log rate limit occurrences for monitoring

### Message Deletion Failures

- If message deletion fails, mark session as offline anyway
- Clean up orphaned messages during periodic cleanup
- Don't block new notifications due to old message cleanup failures

### Database Connection Issues

- Retry database operations once with 1-second delay
- If both attempts fail, log error and continue
- Don't crash bot due to session tracking failures

## Testing Contracts

### Unit Test Requirements

- Mock Discord client for notification posting/deletion
- Mock database for session state persistence
- Test cooldown enforcement with various timing scenarios
- Test error handling for each failure mode

### Integration Test Scenarios

- Player joins → notification posted → player leaves → notification deleted
- Rapid join/leave → only first action processes due to cooldown
- Bot restart with active sessions → state recovered correctly
- Discord API failures → graceful degradation

### Performance Test Criteria

- Handle 10 concurrent player session changes without blocking
- Process JOIN/LEAVE events within 5 seconds of log detection
- Respect Discord API rate limits (no 429 responses)
- Database operations complete within 1 second under normal load
