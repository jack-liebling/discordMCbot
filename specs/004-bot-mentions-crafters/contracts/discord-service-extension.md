# Discord Service Extension Contract

**Component**: DiscordService  
**Extension**: Session notification posting and lifecycle management

## Extension Interface

### New Methods

#### `postSessionNotification(event: SessionEvent, channelConfig: ChannelConfig): Promise<MessageReference>`

**Purpose**: Post JOIN/LEAVE notification with @Crafters role mention  
**Parameters**:

- `event`: Session event data (JOIN/LEAVE with username, timestamp)
- `channelConfig`: Discord channel configuration for "who-is-on" channel

**Returns**: `MessageReference` for tracking and potential deletion
**Throws**: `DiscordApiError` if posting fails

```typescript
interface MessageReference {
  messageId: string;
  channelId: string;
  guildId: string;
  timestamp: Date;
}
```

#### `deleteSessionNotification(messageRef: MessageReference): Promise<boolean>`

**Purpose**: Delete previous notification message (for LEAVE events)  
**Parameters**:

- `messageRef`: Reference to message to delete

**Returns**: `true` if deletion successful, `false` if message not found
**Throws**: `DiscordApiError` if deletion fails due to permissions

### Message Formatting Contract

#### JOIN Event Messages

```typescript
const createJoinEmbed = (username: string, timestamp: Date) => ({
  color: 0x00ff00, // Green
  title: "🟢 Player Joined",
  description: `**${username}** joined the server`,
  timestamp: timestamp.toISOString(),
  footer: {
    text: "Minecraft Server Activity",
  },
});
```

#### Role Mention Format

```typescript
const createSessionMessage = (embed: EmbedBuilder, roleId: string) => ({
  content: `<@&${roleId}>`, // @Crafters role mention
  embeds: [embed],
  allowedMentions: {
    roles: [roleId],
  },
});
```

## Integration Contract

### Channel Configuration

**Required Properties**:

```typescript
interface SessionChannelConfig {
  guildId: string;
  channelId: string; // "who-is-on" channel
  craftersRoleId: string; // @Crafters role ID
  enabled: boolean;
}
```

### Existing Method Extension: `formatEmbed(content: any): EmbedBuilder`

**Enhanced Behavior**:

- Add session event embed formatting alongside existing death embeds
- Maintain consistent styling with current Discord messages
- Support both death events and session events

### Error Recovery

```typescript
interface DiscordApiError extends Error {
  code: number;
  status: number;
  retryable: boolean;
}

const handlePostingError = async (
  error: DiscordApiError,
  event: SessionEvent
) => {
  if (error.retryable && error.code === 50013) {
    // Missing permissions
    logger.error(`Missing permissions to post in channel ${channelId}`);
    return null;
  }

  if (error.retryable && error.status >= 500) {
    // Server error
    await delay(1000);
    return await retryPostMessage(event); // Single retry
  }

  throw error; // Non-retryable error
};
```

## Validation Requirements

### Input Validation

- Channel IDs must be valid Discord snowflakes (18-19 digits)
- Role IDs must be valid Discord snowflakes
- Guild must be accessible to bot
- Channel must exist and be accessible
- Bot must have message posting permissions

### Message Content Validation

- Username length between 3-16 characters
- Timestamp must be valid Date object
- Embed descriptions under Discord 4096 character limit
- Role mentions properly formatted to trigger notifications

### Permission Validation

```typescript
const validateChannelPermissions = async (channelId: string) => {
  const channel = await client.channels.fetch(channelId);
  const permissions = channel.permissionsFor(client.user);

  const required = [
    "ViewChannel",
    "SendMessages",
    "EmbedLinks",
    "MentionEveryone", // For role mentions
  ];

  return required.every((perm) => permissions.has(perm));
};
```

## Performance Contract

### Message Posting Requirements

- Session notifications posted within 2 seconds of event detection
- Message deletion completes within 1 second
- No blocking operations in notification pipeline
- Rate limiting compliance with Discord API (50 requests/second)

### Memory Management

- Message references cached for maximum 24 hours
- Automatic cleanup of expired message references
- No memory leaks from embed creation or message tracking

### Concurrent Operation

- Multiple session events processed concurrently
- Thread-safe message reference storage
- No race conditions between posting and deletion

## Error Handling Contract

### Recoverable Errors

- **Channel Temporarily Unavailable**: Retry once after 1 second delay
- **Rate Limited**: Respect Discord rate limit headers, queue messages
- **Missing Permissions**: Log error, continue operation (graceful degradation)

### Non-Recoverable Errors

- **Channel Deleted**: Disable session notifications for affected channel
- **Bot Removed from Guild**: Disable all notifications for guild
- **Invalid Configuration**: Log error, skip notification

### Error Logging

```typescript
interface SessionNotificationError {
  type: "posting" | "deletion" | "permission" | "configuration";
  username: string;
  channelId: string;
  timestamp: Date;
  error: Error;
  retryable: boolean;
}
```

## Backward Compatibility

### Existing Functionality

- Death announcement embeds remain unchanged
- Existing channel configurations continue working
- Current Discord client connection reused
- No changes to existing embed formatting functions

### New Functionality

- Session notifications are optional feature
- Can be enabled per-channel via configuration
- Graceful fallback if @Crafters role not found
- Independent of existing announcement system

## Testing Contract

### Unit Tests Required

- Join/leave embed formatting with correct colors and content
- Role mention formatting with proper allowedMentions
- Message reference creation and tracking
- Error handling for various Discord API failures

### Integration Tests Required

- End-to-end session notification posting in test Discord server
- Message deletion workflow for leave events
- Permission validation and error recovery
- Rate limiting behavior under high event volume

### Mock Tests Required

- Discord API client mocking for reliable testing
- Channel and role permission simulation
- Error condition simulation (rate limits, permissions, server errors)
- Message reference lifecycle testing
