# Scheduler Service Contract

**Service**: SchedulerService  
**Purpose**: Manage daily timing for leaderboard announcements  
**Dependencies**: ConfigService, LeaderboardService

## Interface Definition

```typescript
export interface SchedulerService {
  /**
   * Start the daily scheduler
   * @returns Promise<void>
   */
  start(): Promise<void>;

  /**
   * Stop the daily scheduler
   * @returns Promise<void>
   */
  stop(): Promise<void>;

  /**
   * Check if current time matches announcement schedule
   * @returns boolean True if current time is 11:59 PM EST
   */
  isAnnouncementTime(): boolean;

  /**
   * Get time until next announcement in milliseconds
   * @returns number Milliseconds until next 11:59 PM EST
   */
  getTimeUntilNextAnnouncement(): number;

  /**
   * Force trigger announcement (for testing/manual execution)
   * @returns Promise<void>
   */
  triggerAnnouncement(): Promise<void>;
}
```

## Timing Contract

### Schedule Definition

- **Target Time**: 11:59 PM EST daily
- **Check Interval**: Every 60 seconds (to detect the target minute)
- **Timezone Handling**: Eastern Standard Time (EST) year-round
- **Date Boundary**: Uses EST date for determining "daily" schedule

### EST Time Calculation

```typescript
// EST is UTC-5 (or UTC-4 during daylight saving time)
// For simplicity, using fixed EST offset as specified in requirements
const EST_OFFSET_HOURS = -5;
const ANNOUNCEMENT_HOUR = 23; // 11 PM
const ANNOUNCEMENT_MINUTE = 59; // 59 minutes

function getCurrentEST(): Date {
  const utc = new Date();
  const est = new Date(utc.getTime() + EST_OFFSET_HOURS * 60 * 60 * 1000);
  return est;
}

function isAnnouncementTime(): boolean {
  const est = getCurrentEST();
  return (
    est.getHours() === ANNOUNCEMENT_HOUR &&
    est.getMinutes() === ANNOUNCEMENT_MINUTE
  );
}
```

## Input Contracts

### start()

**Preconditions**:

- Configuration service must be available
- Leaderboard service must be initialized
- Bot must be connected to Discord

**Processing Rules**:

- Set up interval timer for minute-based checking
- Load last announcement date from configuration
- Begin monitoring for announcement time

### isAnnouncementTime()

**Preconditions**:

- System clock must be available
- No input parameters required

**Processing Rules**:

- Calculate current EST time
- Check if hour equals 23 and minute equals 59
- Return boolean result immediately

### getTimeUntilNextAnnouncement()

**Preconditions**:

- System clock must be available

**Processing Rules**:

- Calculate current EST time
- If current time is before 11:59 PM today, return time until today's 11:59 PM
- If current time is after 11:59 PM today, return time until tomorrow's 11:59 PM
- Return value in milliseconds

## Output Contracts

### start() Returns

```typescript
// Returns: Promise<void>
// Success: Promise resolves when scheduler is active
// Failure: Promise rejects with SchedulerError
```

### isAnnouncementTime() Returns

```typescript
// Returns: boolean
// true: Current EST time is exactly 11:59 PM
// false: Any other time
```

### getTimeUntilNextAnnouncement() Returns

```typescript
// Returns: number (milliseconds)
// Range: 0 to 86,400,000 (24 hours in ms)
// 0: Currently at announcement time
// >0: Milliseconds until next 11:59 PM EST
```

## Event Contracts

### Announcement Trigger Event

```typescript
interface AnnouncementTriggerEvent {
  triggeredAt: Date; // EST timestamp when triggered
  isManual: boolean; // True for manual triggers, false for scheduled
  lastAnnouncementDate: string; // Previous announcement date (YYYY-MM-DD)
  currentDate: string; // Current EST date (YYYY-MM-DD)
}
```

### Scheduler State Events

```typescript
interface SchedulerStateEvent {
  state: "started" | "stopped" | "error";
  timestamp: Date;
  message?: string; // Error message if state is 'error'
}
```

## Error Handling

### Exception Cases

```typescript
// SchedulerError: Base error for scheduler issues
class SchedulerError extends Error {
  constructor(message: string, cause?: Error) {
    super(`Scheduler error: ${message}`);
    this.cause = cause;
  }
}

// TimezoneError: Specific to EST calculation issues
class TimezoneError extends SchedulerError {
  constructor(message: string) {
    super(`Timezone calculation failed: ${message}`);
  }
}

// SchedulingConflictError: When multiple schedules conflict
class SchedulingConflictError extends SchedulerError {
  constructor(message: string) {
    super(`Scheduling conflict: ${message}`);
  }
}
```

### Error Recovery Strategies

- **Clock drift**: Retry time calculation with 1-second delay
- **Missed announcement**: Log warning, schedule for next day
- **Service unavailable**: Queue announcement for retry when service returns
- **Configuration error**: Use default schedule, log error

## Performance Requirements

### Timing Accuracy

- **Check frequency**: Every 60 seconds ±5 seconds
- **Trigger accuracy**: Within 60 seconds of target time (11:59-12:00 PM)
- **Recovery time**: Resume within 2 minutes after service restart

### Resource Constraints

- **CPU usage**: <1% during normal operation
- **Memory usage**: <10MB for scheduling state
- **Timer overhead**: Single interval timer, minimal impact

## State Management

### Persistent State

```typescript
interface SchedulerState {
  isRunning: boolean;
  lastCheckTime: Date;
  nextAnnouncementTime: Date;
  intervalId?: NodeJS.Timeout;
}
```

### State Transitions

```
Stopped → start() → Started → (timer loop) → Trigger Event → Continue
   ↑                                            ↓
   └─────────── stop() ←─── Error Recovery ←────┘
```

## Testing Contracts

### Unit Test Requirements

```typescript
describe("SchedulerService", () => {
  describe("isAnnouncementTime", () => {
    it("should return true at 11:59 PM EST");
    it("should return false at other times");
    it("should handle timezone calculations correctly");
  });

  describe("getTimeUntilNextAnnouncement", () => {
    it("should calculate correct time until today announcement");
    it("should calculate correct time until tomorrow announcement");
    it("should return 0 when currently at announcement time");
  });

  describe("start/stop", () => {
    it("should start timer successfully");
    it("should stop timer successfully");
    it("should handle multiple start calls gracefully");
  });
});
```

### Integration Test Requirements

- Mock system time to test exact timing scenarios
- Verify announcement trigger integration with LeaderboardService
- Test scheduler persistence across bot restarts
- Validate EST calculation during different UTC times
