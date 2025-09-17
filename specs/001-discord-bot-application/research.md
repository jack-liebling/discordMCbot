# Research: Minecraft Death Announcements Discord Bot

## Technology Decisions

### Discord Bot Framework

**Decision**: discord.ts  
**Rationale**: User specified discord.ts preference, provides TypeScript support with strong typing, modern slash commands support, and good documentation for Discord API v10+  
**Alternatives considered**: discord.js (JavaScript), discord.py (Python) - rejected due to user preference for discord.ts

### RCON Client Library

**Decision**: minecraft-rcon npm package  
**Rationale**: Lightweight, Promise-based RCON client with TypeScript definitions, actively maintained, simple API for connecting to Minecraft servers  
**Alternatives considered**: rcon npm package, custom implementation - rejected for simplicity and maintenance

### Data Storage

**Decision**: JSON file-based storage  
**Rationale**: Aligns with constitution's "keep it simple" principle, sufficient for friend group scale, no database setup required, easy to backup/restore  
**Alternatives considered**: SQLite, PostgreSQL - rejected as overkill for friend group usage

### Death Detection Method

**Decision**: RCON command polling with `/list` and death event monitoring  
**Rationale**: RCON provides server access without mods, can execute commands and monitor server logs, supports authentication  
**Alternatives considered**: Server log file watching, Bukkit/Spigot plugin - rejected for deployment complexity

### Message Formatting

**Decision**: Discord embeds with structured data  
**Rationale**: Better visual presentation, supports fields for organized death information, consistent with modern Discord bot practices  
**Alternatives considered**: Plain text messages - rejected for poor readability

## Integration Patterns

### RCON Connection Pattern

- Persistent connection with reconnection logic
- Graceful handling of server restarts
- Command queuing during disconnections
- Timeout handling for network issues

### Discord Bot Architecture

- Event-driven architecture using discord.ts client events
- Separate modules for RCON handling and Discord messaging
- Environment configuration for tokens and server details
- Error logging without exposing sensitive information

### Data Persistence Pattern

- Simple JSON file with player death statistics
- Atomic writes to prevent corruption
- Backup rotation for data safety
- Schema versioning for future changes

## Best Practices Research

### Discord Bot Security

- Store bot token in environment variables
- Use least privilege permissions (send messages, read message history)
- Validate channel permissions before posting
- Rate limiting compliance with Discord API

### RCON Security

- RCON password in environment variables
- Connection validation and authentication
- Command sanitization (though limited scope)
- Network timeout configuration

### Error Handling

- Graceful degradation when services unavailable
- User-friendly error messages in Discord
- Comprehensive logging for debugging
- Circuit breaker pattern for repeated failures

### Performance Considerations

- Efficient polling intervals to balance responsiveness and load
- Message batching for multiple rapid deaths
- Memory-efficient data structures for death tracking
- Proper resource cleanup on shutdown
