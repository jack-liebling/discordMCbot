# Activity Service Contract

**Service**: ActivityService  
**Purpose**: Manage player activity tracking and retrieval  
**Date**: September 17, 2025

## Interface Definition

```typescript
export interface IActivityService {
  // Activity recording
  recordActivity(activity: NewPlayerActivity): Promise<void>;
  recordBatchActivities(activities: NewPlayerActivity[]): Promise<void>;

  // Activity retrieval
  getPlayerActivities(
    username: string,
    options?: ActivityQueryOptions
  ): Promise<PlayerActivity[]>;
  getActivityByType(
    activityType: ActivityType,
    options?: ActivityQueryOptions
  ): Promise<PlayerActivity[]>;
  getRecentActivities(limit?: number): Promise<PlayerActivity[]>;

  // Session management
  getPlayerSessions(
    username: string,
    options?: SessionQueryOptions
  ): Promise<ActivitySession[]>;
  getCurrentSessions(): Promise<ActivitySession[]>;
  calculateSessionDuration(
    username: string,
    startTime: Date
  ): Promise<number | null>;

  // Statistics
  getPlayerStats(username: string): Promise<EnhancedPlayerStats>;
  getActivitySummary(timeRange?: TimeRange): Promise<ActivitySummary>;

  // Maintenance
  cleanupOldActivities(retentionDays: number): Promise<number>;
  validateActivityIntegrity(): Promise<ValidationResult>;
}
```

## Data Types

```typescript
export interface NewPlayerActivity {
  username: string;
  activity_type: ActivityType;
  timestamp: Date;
  metadata?: ActivityMetadata;
}

export interface ActivityQueryOptions {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
  orderBy?: "timestamp" | "activity_type";
  orderDirection?: "ASC" | "DESC";
}

export interface SessionQueryOptions {
  startDate?: Date;
  endDate?: Date;
  includeOngoing?: boolean;
  minDurationMs?: number;
}

export interface TimeRange {
  startDate: Date;
  endDate: Date;
}

export interface ActivitySummary {
  totalActivities: number;
  activePlayersCount: number;
  activityBreakdown: Record<ActivityType, number>;
  averageSessionDuration: number;
  mostActivePlayer: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  orphanedJoins: number;
  orphanedLeaves: number;
}

export type ActivityType = "JOIN" | "LEAVE" | "CHAT" | "ACHIEVEMENT" | "DEATH";

export type ActivityMetadata =
  | JoinMetadata
  | LeaveMetadata
  | ChatMetadata
  | AchievementMetadata
  | DeathMetadata;

export interface JoinMetadata {
  coordinates?: { x: number; y: number; z: number };
  dimension?: string;
  ip_address?: string;
  entity_id?: number;
}

export interface LeaveMetadata {
  reason?: string;
  duration_ms?: number;
}

export interface ChatMetadata {
  message_length: number;
  contains_mention?: boolean;
  thread_info?: string;
}

export interface AchievementMetadata {
  advancement_name: string;
  advancement_category?: string;
  is_first_time?: boolean;
}

export interface DeathMetadata {
  cause: string;
  coordinates?: { x: number; y: number; z: number };
  experience_level?: number;
  items_lost?: number;
}
```

## Method Specifications

### recordActivity(activity: NewPlayerActivity): Promise<void>

**Purpose**: Record a single player activity event

**Input Validation**:

- `username`: Must be valid Minecraft username (3-16 chars, alphanumeric + underscore)
- `activity_type`: Must be valid ActivityType enum value
- `timestamp`: Must not be in the future, must be after server start time
- `metadata`: Must conform to activity type schema

**Behavior**:

- Apply rate limiting based on activity type and player
- Upsert player record if not exists
- Insert activity record into database
- Update player last_seen_timestamp
- Handle database connection failures gracefully

**Error Conditions**:

- `InvalidActivityError`: Invalid activity type or malformed data
- `RateLimitExceededError`: Activity within rate limit window
- `DatabaseError`: Database connection or constraint failures

### getPlayerActivities(username: string, options?: ActivityQueryOptions): Promise<PlayerActivity[]>

**Purpose**: Retrieve activity history for a specific player

**Input Validation**:

- `username`: Must be valid player name
- `options.limit`: Max 1000 records
- `options.startDate`/`endDate`: Valid date range

**Behavior**:

- Query player_activities table with filters
- Order by timestamp DESC by default
- Apply pagination if limit/offset specified
- Return empty array if player not found

**Error Conditions**:

- `PlayerNotFoundError`: Player doesn't exist
- `InvalidQueryError`: Invalid query parameters

### getPlayerSessions(username: string, options?: SessionQueryOptions): Promise<ActivitySession[]>

**Purpose**: Calculate and return player session data

**Behavior**:

- Query JOIN/LEAVE activities for player
- Calculate session durations from activity pairs
- Handle orphaned JOIN records (ongoing sessions)
- Filter by date range and minimum duration if specified

**Session Calculation Logic**:

```typescript
// Pseudo-code for session calculation
const activities = await getPlayerActivities(username, {
  activityTypes: ["JOIN", "LEAVE"],
  orderBy: "timestamp",
  orderDirection: "ASC",
});

const sessions: ActivitySession[] = [];
let currentSession: Partial<ActivitySession> | null = null;

for (const activity of activities) {
  if (activity.activity_type === "JOIN") {
    if (currentSession) {
      // Previous session wasn't closed, mark as ended at this JOIN
      currentSession.end_timestamp = activity.timestamp;
      currentSession.duration_ms = calculateDuration(currentSession);
      sessions.push(currentSession as ActivitySession);
    }
    currentSession = {
      session_id: `${username}-${activity.timestamp.getTime()}`,
      username,
      start_timestamp: activity.timestamp,
      activities_during_session: [],
    };
  } else if (activity.activity_type === "LEAVE" && currentSession) {
    currentSession.end_timestamp = activity.timestamp;
    currentSession.duration_ms = calculateDuration(currentSession);
    sessions.push(currentSession as ActivitySession);
    currentSession = null;
  }
}

// Handle ongoing session
if (currentSession) {
  currentSession.end_timestamp = null;
  currentSession.duration_ms = null;
  sessions.push(currentSession as ActivitySession);
}

return sessions;
```

## Rate Limiting Contract

```typescript
export interface IRateLimiter {
  checkRateLimit(
    username: string,
    activityType: ActivityType
  ): Promise<boolean>;
  recordActivity(
    username: string,
    activityType: ActivityType,
    timestamp: Date
  ): Promise<void>;
  getRateLimit(activityType: ActivityType): number; // milliseconds
}

// Rate limit configuration per activity type
export const RATE_LIMITS: Record<ActivityType, number> = {
  DEATH: 30000, // 30 seconds
  CHAT: 1000, // 1 second
  ACHIEVEMENT: 5000, // 5 seconds
  JOIN: 10000, // 10 seconds
  LEAVE: 5000, // 5 seconds
};
```

## Error Handling

### Error Types

```typescript
export class ActivityServiceError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "ActivityServiceError";
  }
}

export class InvalidActivityError extends ActivityServiceError {
  constructor(message: string) {
    super(message, "INVALID_ACTIVITY");
  }
}

export class RateLimitExceededError extends ActivityServiceError {
  constructor(activityType: ActivityType, remainingTime: number) {
    super(
      `Rate limit exceeded for ${activityType}. Try again in ${remainingTime}ms`,
      "RATE_LIMIT_EXCEEDED"
    );
  }
}

export class PlayerNotFoundError extends ActivityServiceError {
  constructor(username: string) {
    super(`Player ${username} not found`, "PLAYER_NOT_FOUND");
  }
}

export class DatabaseError extends ActivityServiceError {
  constructor(message: string, public originalError?: Error) {
    super(message, "DATABASE_ERROR");
  }
}
```

### Graceful Degradation

- **Database Unavailable**: Fall back to JSON file storage using hybridStorage pattern
- **Rate Limit Exceeded**: Log warning, skip activity recording, continue processing
- **Invalid Activity Data**: Log error, skip malformed record, continue with next activity
- **Session Calculation Errors**: Return partial sessions, log inconsistencies

## Integration Points

### With Existing Systems

**LogParser Integration**:

```typescript
// In logParser.ts
const activityService = new ActivityService(hybridStorage);

async function processLogLine(line: string): Promise<void> {
  const activities = parseActivitiesFromLine(line);

  for (const activity of activities) {
    try {
      await activityService.recordActivity(activity);
    } catch (error) {
      logger.warn(`Failed to record activity: ${error.message}`);
      // Continue processing other activities
    }
  }
}
```

**Database Integration**:

```typescript
// Extend existing database.ts
export class DatabaseService {
  // ... existing methods ...

  async saveActivity(activity: NewPlayerActivity): Promise<void> {
    // Implementation matches contract
  }

  async getActivities(
    options: ActivityQueryOptions
  ): Promise<PlayerActivity[]> {
    // Implementation matches contract
  }
}
```

## Testing Contract

Each method must have corresponding tests that verify:

- Input validation and error handling
- Rate limiting behavior
- Database operations and transactions
- Session calculation accuracy
- Graceful degradation scenarios

Test files should be created for:

- `ActivityService.test.ts`
- `RateLimiter.test.ts`
- `SessionCalculator.test.ts`
- `ActivityParser.test.ts`
