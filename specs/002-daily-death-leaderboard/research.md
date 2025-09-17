# Research: Daily Death Leaderboard

**Feature**: Daily Death Leaderboard  
**Date**: September 17, 2025  
**Status**: Complete

## Research Questions & Findings

### 1. Node.js Scheduling for Daily Tasks

**Decision**: Use `setInterval` with date checking rather than cron libraries  
**Rationale**:

- Keeps dependencies minimal (constitutional principle: keep it simple)
- Built-in Node.js functionality is reliable for daily frequency
- Easier to test and debug than external cron libraries
- Bot already runs continuously for FTP monitoring

**Alternatives considered**:

- `node-cron`: Additional dependency, overkill for single daily task
- External cron job: Requires system configuration, violates single-process design
- `setTimeout` recursive: More complex date boundary handling

### 2. EST Timezone Handling for 11:59 PM

**Decision**: Use JavaScript `Date` with EST offset calculation  
**Rationale**:

- No additional timezone library needed (moment.js, date-fns too heavy)
- EST is fixed offset (-5 UTC, -4 during DST)
- Simple calculation: `new Date().getHours() === 23 && new Date().getMinutes() === 59`
- Existing bot already handles timezone for log parsing

**Alternatives considered**:

- `moment-timezone`: Heavy dependency for single timezone
- `Intl.DateTimeFormat`: More complex API for simple daily check
- UTC-only: User specifically requested EST timing

### 3. Player Activity Tracking (7-day window)

**Decision**: Extend existing Player interface with `lastSeenTimestamp`  
**Rationale**:

- Reuses existing player tracking infrastructure
- Simple date comparison for 7-day window
- Minimal storage overhead (one additional timestamp per player)
- Fits existing JSON persistence pattern

**Alternatives considered**:

- Separate activity log: Over-engineering for friend group usage
- FTP log parsing for activity: Performance overhead for daily batch
- Discord presence API: Unreliable, requires different permissions

### 4. Leaderboard Formatting in Discord

**Decision**: Use Discord embeds with field-based layout  
**Rationale**:

- Existing bot already uses embeds for death announcements
- Fields provide clean tabular display for leaderboards
- Built-in Discord formatting (bold, inline fields)
- Consistent with existing bot message style

**Alternatives considered**:

- Plain text with markdown: Less visually appealing
- Multiple messages: Fragmented user experience
- Images/charts: Unnecessary complexity for text data

### 5. Persistence of Daily Schedule State

**Decision**: Extend existing config.json with `lastLeaderboardDate`  
**Rationale**:

- Reuses existing configuration persistence pattern
- Prevents duplicate announcements after bot restart
- Simple date string comparison
- Minimal storage footprint

**Alternatives considered**:

- In-memory only: Lost on restart, potential duplicates
- Separate schedule file: Unnecessary file proliferation
- Database: Overkill for single date tracking

## Technical Integration Points

### Existing Components to Leverage

- **Storage Service**: Extend for leaderboard date tracking
- **Discord Service**: Reuse embed formatting patterns
- **Player Tracker**: Extend with activity timestamp updates
- **Logger**: Reuse for leaderboard generation logging

### New Components Required

- **Leaderboard Generator**: Daily batch processing service
- **Scheduler**: Daily timing coordination
- **Survival Calculator**: Time-alive computation for active players

## Performance Considerations

**Daily Processing Load**:

- Player count: ~10-20 (friend group scale)
- Death records: Accumulated over time, minimal processing
- Sort operation: O(n log n) where n < 50, negligible performance
- Discord API: Single embed message, well within rate limits

**Memory Usage**:

- Additional timestamp per player: ~8 bytes × 20 players = 160 bytes
- Leaderboard generation: Temporary arrays during processing
- No streaming required for small dataset

## Security & Safety

**Rate Limiting**: Daily frequency inherently rate-limited  
**Error Handling**: Extend existing graceful error patterns  
**Permission Checks**: Reuse existing Discord channel permissions  
**Data Validation**: Validate player data before leaderboard generation

## Implementation Risk Assessment

**Low Risk**:

- Extends proven patterns from existing death announcements
- Uses established infrastructure (FTP parsing, Discord embeds)
- Simple daily frequency reduces complexity

**Medium Risk**:

- EST timezone handling during DST transitions
- Player activity definition (what constitutes "active"?)

**Mitigation Strategies**:

- Conservative activity tracking (any death = active)
- Graceful handling of timezone edge cases
- Comprehensive logging for debugging daily scheduling

## Constitutional Compliance Review

**✅ Single Feature Focus**: Leaderboard is isolated, well-scoped addition  
**✅ Friend-Focused Design**: Provides friendly competition without complexity  
**✅ Just Make It Work**: Leverages existing infrastructure for quick delivery  
**✅ Safety and Moderation**: Inherits existing safety patterns  
**✅ Keep It Simple**: Minimal code addition, reuses established patterns

**Final Assessment**: Research confirms feature can be implemented within constitutional constraints using existing technical foundation.
