# Data Model: Enhanced Player Activity Tracking

**Feature**: Enhanced Player Activity Tracking  
**Date**: September 17, 2025  
**Version**: 1.0

## Entity Overview

This data model extends the existing player tracking system to support comprehensive activity monitoring beyond just deaths. The design maintains backward compatibility while adding new activity tracking capabilities.

## Core Entities

### 1. PlayerActivity

**Purpose**: Represents individual activity events with timestamp and metadata

**Fields**:

- `id`: SERIAL PRIMARY KEY - Unique identifier for the activity record
- `username`: VARCHAR(255) NOT NULL - Player identifier (matches existing players table)
- `activity_type`: VARCHAR(50) NOT NULL - Type of activity (enum: JOIN, LEAVE, CHAT, ACHIEVEMENT, DEATH)
- `timestamp`: TIMESTAMPTZ NOT NULL - When the activity occurred (parsed from log timestamp)
- `metadata`: JSONB - Activity-specific data stored as flexible JSON
- `created_at`: TIMESTAMPTZ DEFAULT NOW() - When the record was created in the database

**Validation Rules**:

- `username` must match existing Minecraft username patterns (alphanumeric, underscore, 3-16 chars)
- `activity_type` must be one of: 'JOIN', 'LEAVE', 'CHAT', 'ACHIEVEMENT', 'DEATH'
- `timestamp` must be within reasonable bounds (not future, not before server start)
- `metadata` must be valid JSON and contain required fields per activity type

**Metadata Schema by Activity Type**:

```typescript
// JOIN activity metadata
{
  coordinates?: { x: number, y: number, z: number },
  dimension?: string, // e.g., "Ironman", "the_nether"
  ip_address?: string, // for debugging connection issues
  entity_id?: number
}

// LEAVE activity metadata
{
  reason?: string, // "Disconnected", "Server restart", etc.
  duration_ms?: number // calculated session duration if JOIN found
}

// CHAT activity metadata
{
  message_length: number, // character count for analytics
  contains_mention?: boolean, // if message contains @mentions
  thread_info?: string // async chat thread identifier
}

// ACHIEVEMENT activity metadata
{
  advancement_name: string, // e.g., "Acquire Hardware", "Suit Up"
  advancement_category?: string, // parsed from advancement name
  is_first_time?: boolean // if this is player's first time getting this advancement
}

// DEATH activity metadata (enhanced existing)
{
  cause: string, // e.g., "drowned", "fell from a high place"
  coordinates?: { x: number, y: number, z: number },
  experience_level?: number,
  items_lost?: number // if parseable from log
}
```

### 2. Player (Enhanced Existing)

**Purpose**: Aggregated player statistics and profile information

**Existing Fields** (unchanged):

- `username`: VARCHAR(255) PRIMARY KEY
- `total_deaths`: INTEGER NOT NULL DEFAULT 0
- `last_death_timestamp`: TIMESTAMPTZ
- `first_seen`: TIMESTAMPTZ NOT NULL DEFAULT NOW()
- `last_updated`: TIMESTAMPTZ NOT NULL DEFAULT NOW()
- `last_seen_timestamp`: TIMESTAMPTZ NOT NULL DEFAULT NOW()

**Enhanced Fields** (calculated from PlayerActivity):

- Virtual fields calculated on-demand from `player_activities` table:
  - `total_sessions`: COUNT of JOIN activities
  - `total_playtime_ms`: SUM of session durations
  - `total_chat_messages`: COUNT of CHAT activities
  - `total_achievements`: COUNT of ACHIEVEMENT activities
  - `last_activity_timestamp`: MAX timestamp from any activity
  - `activity_breakdown`: Count per activity type

**Relationships**:

- One Player to Many PlayerActivity (username foreign key)

### 3. ActivitySession (Virtual Entity)

**Purpose**: Represents a continuous play session calculated from JOIN/LEAVE pairs

**Note**: This is not a stored table but a calculated entity from PlayerActivity records.

**Calculated Fields**:

- `session_id`: Generated identifier (username + start_timestamp)
- `username`: Player identifier
- `start_timestamp`: Timestamp of JOIN activity
- `end_timestamp`: Timestamp of matching LEAVE activity (null if ongoing)
- `duration_ms`: Calculated duration (null if ongoing)
- `activities_during_session`: Array of activities between JOIN and LEAVE
- `achievements_earned`: Count of achievements during session
- `chat_messages_sent`: Count of chat messages during session
- `deaths_occurred`: Count of deaths during session

**Calculation Logic**:

```sql
-- Example query to calculate sessions
WITH sessions AS (
  SELECT
    username,
    timestamp as start_time,
    LEAD(timestamp) OVER (
      PARTITION BY username
      ORDER BY timestamp
    ) as end_time
  FROM player_activities
  WHERE activity_type IN ('JOIN', 'LEAVE')
  ORDER BY username, timestamp
)
SELECT * FROM sessions WHERE start_time IS NOT NULL;
```

## Database Schema

### New Tables

```sql
-- Player activities table
CREATE TABLE player_activities (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) NOT NULL,
  activity_type VARCHAR(50) NOT NULL CHECK (activity_type IN ('JOIN', 'LEAVE', 'CHAT', 'ACHIEVEMENT', 'DEATH')),
  timestamp TIMESTAMPTZ NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Foreign key to existing players table
  CONSTRAINT fk_activity_player FOREIGN KEY (username) REFERENCES players(username) ON DELETE CASCADE
);

-- Indices for performance
CREATE INDEX idx_activities_username ON player_activities (username);
CREATE INDEX idx_activities_type ON player_activities (activity_type);
CREATE INDEX idx_activities_timestamp ON player_activities (timestamp DESC);
CREATE INDEX idx_activities_username_timestamp ON player_activities (username, timestamp DESC);
CREATE INDEX idx_activities_type_timestamp ON player_activities (activity_type, timestamp DESC);

-- GIN index for metadata queries
CREATE INDEX idx_activities_metadata ON player_activities USING GIN (metadata);
```

### Existing Tables (Unchanged)

The existing `players` and `config` tables remain unchanged to maintain backward compatibility.

## State Transitions

### Player Lifecycle

1. **First Activity**: Player record created in `players` table, first `PlayerActivity` recorded
2. **Subsequent Activities**: New `PlayerActivity` records added, `players.last_updated` and `players.last_seen_timestamp` updated
3. **Death Events**: Both `PlayerActivity` (with DEATH type) and existing death tracking updated
4. **Session End**: LEAVE activity recorded, session duration can be calculated

### Activity Processing Flow

1. **Log Line Parsed**: Activity detected from log pattern matching
2. **Rate Limiting Check**: Verify activity not duplicate within rate limit window
3. **Player Upsert**: Ensure player exists in `players` table
4. **Activity Insert**: Add new record to `player_activities` table
5. **Player Update**: Update `players` table timestamps and counters as needed

## Data Integrity

### Constraints

- All activity records must reference valid players
- Activity timestamps must be chronologically reasonable
- Metadata must conform to activity type schema
- Rate limiting prevents duplicate activities within time windows

### Consistency Rules

- Player `last_seen_timestamp` always matches most recent activity timestamp
- Death counts in `players` table match DEATH activity count
- Session calculations handle orphaned JOIN/LEAVE records gracefully

### Cleanup Policies

- Consider retention policy for old activities (e.g., 1 year)
- Archive rather than delete for historical analysis
- Maintain player aggregates even after activity cleanup

## Migration Strategy

### Phase 1: Schema Addition

- Add `player_activities` table alongside existing schema
- Existing functionality continues unchanged
- New activity tracking runs in parallel

### Phase 2: Populate Historical Data

- Optionally backfill death activities from existing player records
- Mark backfilled records with metadata flag

### Phase 3: Enhanced Features

- Build activity analytics on top of new schema
- Activity-based leaderboards and statistics
- Session-based insights and reporting

## TypeScript Interfaces

```typescript
// New interfaces for activity tracking
export interface PlayerActivity {
  id: number;
  username: string;
  activity_type: "JOIN" | "LEAVE" | "CHAT" | "ACHIEVEMENT" | "DEATH";
  timestamp: Date;
  metadata?: Record<string, any>;
  created_at: Date;
}

export interface ActivitySession {
  session_id: string;
  username: string;
  start_timestamp: Date;
  end_timestamp: Date | null;
  duration_ms: number | null;
  activities_during_session: PlayerActivity[];
  achievements_earned: number;
  chat_messages_sent: number;
  deaths_occurred: number;
}

export interface EnhancedPlayerStats {
  // Existing player fields
  username: string;
  totalDeaths: number;
  lastDeathTimestamp: string | null;
  firstSeen: string;
  lastUpdated: string;
  lastSeenTimestamp: string;

  // New calculated fields
  totalSessions: number;
  totalPlaytimeMs: number;
  totalChatMessages: number;
  totalAchievements: number;
  lastActivityTimestamp: string;
  activityBreakdown: Record<string, number>;
}
```
