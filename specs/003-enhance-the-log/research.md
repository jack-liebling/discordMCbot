# Research: Enhanced Player Activity Tracking

**Feature**: Enhanced Player Activity Tracking  
**Date**: September 17, 2025  
**Research Phase**: Complete

## Research Objectives

Based on the feature specification and technical context, investigate:

1. **Log Pattern Analysis**: Identify all trackable player activities from Minecraft server logs
2. **Database Schema Extension**: Research optimal way to extend existing PostgreSQL schema for activity tracking
3. **Performance Considerations**: Analyze impact of tracking multiple activity types on FTP polling and database operations
4. **Parsing Strategy**: Research regex patterns and parsing approaches for new activity types

## Key Technical Decisions

### 1. Activity Type Detection Strategy

**Decision**: Extend existing regex-based parsing in logParser.ts with activity-specific patterns

**Rationale**:

- Current death detection already uses proven regex approach
- Log patterns from example file show consistent formatting
- Each activity type has distinct, parseable patterns
- Minimal code changes required

**Alternatives Considered**:

- Complete log parser rewrite: Rejected (violates "just make it work" principle)
- Third-party log parsing library: Rejected (adds dependency, overkill for simple patterns)

**Implementation Pattern**:

```typescript
// Example patterns identified from latest.log
const ACTIVITY_PATTERNS = {
  JOIN: /(\d{2}:\d{2}:\d{2}).*?\[Server thread\/INFO\]: (\w+) joined the game/,
  LEAVE: /(\d{2}:\d{2}:\d{2}).*?\[Server thread\/INFO\]: (\w+) left the game/,
  CHAT: /(\d{2}:\d{2}:\d{2}).*?\[Async Chat Thread.*?\]: <(\w+)> (.+)/,
  ACHIEVEMENT:
    /(\d{2}:\d{2}:\d{2}).*?\[Server thread\/INFO\]: (\w+) has made the advancement \[(.+)\]/,
  DEATH: /(\d{2}:\d{2}:\d{2}).*?\[Server thread\/INFO\]: (\w+) (.+)/, // Existing pattern
};
```

### 2. Database Schema Extension

**Decision**: Add new `player_activities` table with polymorphic activity storage

**Rationale**:

- Preserves existing `players` table and functionality
- Allows unlimited activity history without schema changes
- Supports efficient querying by player, activity type, or time range
- Follows PostgreSQL best practices for activity logging

**Alternatives Considered**:

- Add columns to existing players table: Rejected (loses activity history, requires schema migration)
- Separate table per activity type: Rejected (creates maintenance overhead)
- JSON column in players table: Rejected (poor query performance, harder to aggregate)

**Schema Design**:

```sql
CREATE TABLE player_activities (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) NOT NULL,
  activity_type VARCHAR(50) NOT NULL, -- 'JOIN', 'LEAVE', 'CHAT', 'ACHIEVEMENT', 'DEATH'
  timestamp TIMESTAMPTZ NOT NULL,
  metadata JSONB, -- Flexible storage for activity-specific data
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices for efficient querying
CREATE INDEX idx_activities_username ON player_activities (username);
CREATE INDEX idx_activities_type ON player_activities (activity_type);
CREATE INDEX idx_activities_timestamp ON player_activities (timestamp DESC);
```

### 3. Session Tracking Approach

**Decision**: Calculate sessions dynamically from JOIN/LEAVE activities rather than storing session state

**Rationale**:

- Simpler implementation - no session state management
- Handles server crashes and unexpected disconnects gracefully
- Easy to recalculate historical sessions
- Avoids complexity of managing active sessions across bot restarts

**Alternatives Considered**:

- Separate sessions table: Rejected (adds complexity, state management issues)
- Session state in memory: Rejected (lost on bot restart)

**Implementation Strategy**:

- Track JOIN and LEAVE activities as separate records
- Calculate session duration on-demand by finding matching JOIN/LEAVE pairs
- Handle edge cases (server restart, unexpected disconnect) through timeout logic

### 4. Rate Limiting Extension

**Decision**: Extend existing rate limiting to apply per-activity-type rather than globally

**Rationale**:

- Prevents spam from rapid-fire chat messages or achievement unlocks
- Maintains existing death rate limiting behavior
- Allows fine-tuned control per activity type
- Reuses existing rate limiting infrastructure

**Implementation**:

```typescript
interface RateLimitConfig {
  DEATH: 30000; // 30 seconds (existing)
  CHAT: 1000; // 1 second (prevent chat spam)
  ACHIEVEMENT: 5000; // 5 seconds (prevent achievement spam)
  JOIN: 10000; // 10 seconds (prevent connection spam)
  LEAVE: 5000; // 5 seconds (allow quick reconnects)
}
```

## Performance Analysis

### FTP Polling Impact

- **Current**: Single regex pass for death detection
- **Enhanced**: Multiple regex passes for each activity type
- **Mitigation**: Process activities in single pass with combined regex patterns
- **Expected Impact**: <10% increase in processing time per log line

### Database Write Performance

- **Current**: ~1 death event per 5-10 minutes
- **Enhanced**: ~5-20 activity events per active player per session
- **Mitigation**: Batch inserts for activities within same polling cycle
- **Expected Impact**: Acceptable for friend group usage (<10 concurrent players)

### Storage Growth

- **Current**: ~1KB per player (static player record)
- **Enhanced**: ~50-200 activities per player per day (~5-20KB daily growth)
- **Mitigation**: Consider activity retention policies for long-term deployment
- **Expected Impact**: Minimal for PostgreSQL database (Railway 1GB limit sufficient for years)

## Integration Points

### Existing Code Compatibility

- **logParser.ts**: Extend `parseLogLine()` method with new activity patterns
- **database.ts**: Add `player_activities` table management methods
- **types.ts**: Add activity-related interfaces
- **hybridStorage.ts**: Extend with activity storage methods for JSON fallback

### Error Handling Strategy

- Invalid log patterns: Log warning, continue processing
- Database write failures: Fall back to JSON storage (existing pattern)
- Activity parsing errors: Skip malformed entries, don't halt processing
- Rate limiting violations: Silently drop duplicate activities

## Research Conclusions

✅ **Technical Feasibility**: High - builds on existing proven patterns  
✅ **Performance Impact**: Low - acceptable for target scale  
✅ **Implementation Complexity**: Low - extends existing code naturally  
✅ **Constitutional Compliance**: Full - maintains "just make it work" principle

**Ready for Phase 1**: All technical unknowns resolved. Proceed with detailed design and contracts.
