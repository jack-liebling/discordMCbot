# Leaderboard Service Contract

**Service**: LeaderboardService  
**Purpose**: Generate and manage daily death leaderboards  
**Dependencies**: StorageService, PlayerTracker

## Interface Definition

```typescript
export interface LeaderboardService {
  /**
   * Generate current leaderboard based on all tracked players
   * @returns Promise<DailyLeaderboard> Generated leaderboard data
   */
  generateLeaderboard(): Promise<DailyLeaderboard>;

  /**
   * Check if leaderboard should be announced today
   * @returns Promise<boolean> True if announcement is due
   */
  shouldAnnounceToday(): Promise<boolean>;

  /**
   * Mark leaderboard as announced for today
   * @returns Promise<void>
   */
  markAnnouncementComplete(): Promise<void>;

  /**
   * Get survival champion from active players
   * @param players Player[] Array of players to evaluate
   * @returns SurvivalChampion | null Current survival champion or null if none
   */
  getSurvivalChampion(players: Player[]): SurvivalChampion | null;

  /**
   * Filter players to only those active within 7 days
   * @param players Player[] All players to filter
   * @returns Player[] Players active within the past week
   */
  getActivePlayers(players: Player[]): Player[];
}
```

## Input Contracts

### generateLeaderboard()

**Preconditions**:

- Storage service must be initialized
- Player data must be loaded and valid
- At least one player exists (or returns empty leaderboard)

**Input**: None (reads from storage)

**Processing Rules**:

- Sort players by totalDeaths (ascending), then username (alphabetical)
- Calculate survival champion from active players only
- Generate rank numbers starting from 1
- Include both active and inactive players in main leaderboard

### shouldAnnounceToday()

**Preconditions**:

- Configuration must be loaded
- Current system time must be available

**Input**: None (reads system time and config)

**Processing Rules**:

- Check current time is 11:59 PM EST
- Compare current date (EST) with lastAnnouncementDate
- Return true only if different dates and correct time

### getSurvivalChampion(players)

**Preconditions**:

- players array must contain valid Player objects
- Players must have valid timestamp fields

**Input Validation**:

```typescript
// Input: Player[]
// Validation rules:
- players.length >= 0 (empty array allowed)
- Each player.lastSeenTimestamp must be valid Date
- Each player.lastDeathTimestamp must be valid Date | null
- Each player.firstSeen must be valid Date
```

**Processing Rules**:

- Filter to players with lastSeenTimestamp within 7 days
- For each active player, calculate time alive:
  - If lastDeathTimestamp exists: currentTime - lastDeathTimestamp
  - If null: currentTime - firstSeen
- Return player with maximum time alive
- Return null if no active players

## Output Contracts

### generateLeaderboard() Returns

```typescript
interface DailyLeaderboard {
  generatedAt: Date; // Timestamp of generation
  totalPlayers: number; // Count of all players
  leaderboard: LeaderboardEntry[]; // Sorted ranking
  survivalChampion: SurvivalChampion | null; // Active player with longest survival
}

interface LeaderboardEntry {
  rank: number; // 1-based ranking
  username: string; // Player display name
  totalDeaths: number; // Cumulative death count
  isActive: boolean; // Within 7-day activity window
}

interface SurvivalChampion {
  username: string; // Player display name
  timeAliveMs: number; // Milliseconds since last death
  lastDeathTimestamp: Date | null; // Last death time or null
  formattedTimeAlive: string; // Human readable (e.g., "3 days, 5 hours")
}
```

### shouldAnnounceToday() Returns

```typescript
// Returns: boolean
// true: Current time is 11:59 PM EST and today's date differs from lastAnnouncementDate
// false: Either wrong time or already announced today
```

## Error Handling

### Exception Cases

```typescript
// LeaderboardGenerationError: Thrown when leaderboard generation fails
class LeaderboardGenerationError extends Error {
  constructor(message: string, cause?: Error) {
    super(`Leaderboard generation failed: ${message}`);
    this.cause = cause;
  }
}

// ConfigurationError: Thrown when leaderboard config is invalid
class ConfigurationError extends Error {
  constructor(message: string) {
    super(`Leaderboard configuration error: ${message}`);
  }
}
```

### Error Recovery

- **Storage unavailable**: Return empty leaderboard with error flag
- **Invalid player data**: Skip corrupted players, log warning
- **Time calculation errors**: Use fallback values (firstSeen timestamp)
- **Configuration missing**: Use default values, continue operation

## Performance Requirements

### Response Time Targets

- `generateLeaderboard()`: < 50ms for 20 players
- `shouldAnnounceToday()`: < 5ms (simple date comparison)
- `getSurvivalChampion()`: < 10ms for 20 players
- `getActivePlayers()`: < 5ms for 20 players

### Resource Constraints

- Memory usage: < 1MB during leaderboard generation
- CPU usage: Negligible for friend group scale
- I/O operations: Read-only access to existing storage files

## Testing Contracts

### Unit Test Requirements

```typescript
describe("LeaderboardService", () => {
  describe("generateLeaderboard", () => {
    it("should sort players by death count ascending, then alphabetically");
    it("should handle empty player list gracefully");
    it("should include survival champion when active players exist");
    it("should return null survival champion when no active players");
  });

  describe("shouldAnnounceToday", () => {
    it("should return true at 11:59 PM EST if not announced today");
    it("should return false if already announced today");
    it("should return false at incorrect times");
  });

  describe("getSurvivalChampion", () => {
    it("should return player with longest survival time");
    it("should filter out inactive players (>7 days)");
    it("should handle players with no death timestamp");
    it("should return null for empty active player list");
  });
});
```

### Integration Test Requirements

- End-to-end leaderboard generation with real player data
- Time-based scheduling validation with mocked system time
- Configuration persistence and loading verification
- Discord embed formatting integration
