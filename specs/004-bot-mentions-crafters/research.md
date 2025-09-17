# Research: Player Online Notifications Implementation

**Date**: September 17, 2025  
**Feature**: Player Online Notifications with Crafters Role Mentions

## Research Tasks Completed

### 1. Minecraft Server JOIN/LEAVE Log Patterns

**Decision**: Extend existing log parsing with JOIN/LEAVE patterns  
**Rationale**: Leverage proven FTP log parsing infrastructure already implemented for death tracking

**Log Pattern Analysis**:

```
JOIN patterns:
- "[HH:MM:SS] [Server thread/INFO]: PlayerName joined the game"
- "[HH:MM:SS] [Server thread/INFO]: PlayerName[/IP:PORT] logged in with entity id"

LEAVE patterns:
- "[HH:MM:SS] [Server thread/INFO]: PlayerName left the game"
- "[HH:MM:SS] [Server thread/INFO]: PlayerName lost connection: Disconnected"
```

**Alternatives considered**:

- RCON polling for player list (rejected - existing architecture moved away from RCON)
- Server query protocols (rejected - unnecessary complexity for existing FTP approach)

### 2. Discord.js Message Lifecycle Management

**Decision**: Use Discord.js message references with scheduled deletion  
**Rationale**: Post JOIN notification immediately, then delete 2 minutes after LEAVE event detected

**Implementation Pattern**:

```typescript
// Post JOIN notification
const message = await channel.send({
  content: `<@&${craftersRoleId}>`,
  embeds: [joinEmbed],
});
await database.storeNotification(player, message.id, "JOIN", new Date());

// On LEAVE event - schedule deletion after 2 minutes
setTimeout(async () => {
  const messageId = await database.getNotificationId(player);
  if (messageId) {
    await channel.messages.delete(messageId);
    await database.clearNotification(player);
  }
}, 2 * 60 * 1000); // 2 minutes
```

**Alternatives considered**:

- Immediate deletion on LEAVE (rejected - user wants 2-minute delay)
- Separate LEAVE notifications (rejected - user wants JOIN only)
- Memory-only tracking (rejected - data lost on bot restart)

### 3. Cooldown/Rate Limiting Patterns

**Decision**: Simplified cooldown for notification posting only  
**Rationale**: Prevent spam from rapid join/leave cycles, but allow single JOIN notifications

**Pattern Analysis**:

```typescript
// Check if player can post JOIN notification
const canPost = !rateLimiter.isInCooldown(player, "JOIN_NOTIFICATION");
if (!canPost) {
  logger.debug(`JOIN notification blocked for ${player} - within cooldown`);
  return;
}

// Post notification and set cooldown
await postJoinNotification(player);
rateLimiter.setCooldown(player, "JOIN_NOTIFICATION", 2 * 60 * 1000);
```

**Key Requirements**:

- Cooldown only applies to posting new JOIN notifications
- 2-minute cooldown period to prevent rapid join/leave spam
- Deletion happens automatically after LEAVE regardless of cooldown

**Alternatives considered**:

- Global cooldowns (rejected - would affect all players)
- Fixed intervals (rejected - needs to be event-driven)

## Implementation Approach Summary

**Core Strategy**: Extend existing architecture with minimal new components

- Reuse FTP log parsing infrastructure
- Extend existing database schema with session notification table
- Add new sessionNotifier service following existing patterns
- Integrate with existing Discord announcer architecture

**Risk Mitigation**:

- All new code follows established patterns from death tracking system
- Database migrations ensure backward compatibility
- Graceful degradation if Discord API calls fail
- Comprehensive logging for debugging session state issues

## Technology Decisions Confirmed

- **Log Parsing**: Extend existing logParser.ts with JOIN/LEAVE regex patterns
- **Storage**: Add `player_session_notifications` table to existing PostgreSQL database
- **Discord Integration**: Use existing discord.js client with message lifecycle tracking
- **Rate Limiting**: Extend existing RateLimiter class with SESSION_CHANGE activity type
- **Error Handling**: Follow existing patterns with graceful degradation and logging
