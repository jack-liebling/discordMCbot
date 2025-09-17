# Log Parser Contract

**Service**: LogParser  
**Purpose**: Parse Minecraft server log files and extract player activities  
**Date**: September 17, 2025

## Interface Definition

```typescript
export interface ILogParser {
  // Core parsing methods
  parseLogLine(line: string): PlayerActivity[];
  parseLogFile(filePath: string): Promise<PlayerActivity[]>;
  parseLogStream(stream: NodeJS.ReadableStream): Promise<PlayerActivity[]>;

  // Activity detection
  detectActivities(logContent: string): PlayerActivity[];
  isValidLogLine(line: string): boolean;
  extractTimestamp(line: string): Date | null;

  // Pattern management
  getActivityPatterns(): Record<ActivityType, RegExp>;
  addCustomPattern(activityType: ActivityType, pattern: RegExp): void;
  testPattern(pattern: RegExp, testLine: string): boolean;
}
```

## Log Pattern Specifications

### Pattern Definitions

Based on analysis of Minecraft server logs, the following regex patterns detect each activity type:

```typescript
export const ACTIVITY_PATTERNS: Record<ActivityType, RegExp> = {
  // Player join detection
  JOIN: /\[(\d{2}:\d{2}:\d{2})\].*?\[Server thread\/INFO\]: (\w+) joined the game/,

  // Player leave detection
  LEAVE:
    /\[(\d{2}:\d{2}:\d{2})\].*?\[Server thread\/INFO\]: (\w+) left the game/,

  // Chat message detection
  CHAT: /\[(\d{2}:\d{2}:\d{2})\].*?\[Async Chat Thread.*?\]: <(\w+)> (.+)/,

  // Achievement detection
  ACHIEVEMENT:
    /\[(\d{2}:\d{2}:\d{2})\].*?\[Server thread\/INFO\]: (\w+) has made the advancement \[(.+)\]/,

  // Death detection (existing pattern enhanced)
  DEATH: /\[(\d{2}:\d{2}:\d{2})\].*?\[Server thread\/INFO\]: (\w+) (.+)/,
};

// Additional patterns for enhanced data extraction
export const ENHANCED_PATTERNS = {
  // Player login with coordinates
  LOGIN_DETAILS:
    /(\w+)\[\/([0-9.:]+)\] logged in with entity id (\d+) at \(\[([^\]]+)\]([^)]+)\)/,

  // UUID mapping
  UUID_MAPPING: /UUID of player (\w+) is ([a-f0-9-]+)/,

  // Disconnect reason
  DISCONNECT_REASON: /(\w+) lost connection: (.+)/,

  // Server status messages (for context)
  PLAYER_COUNT: /There are (\d+) of a max of (\d+) players online:?\s*(.*)/,
};
```

### Pattern Matching Logic

```typescript
export function parseLogLine(line: string): PlayerActivity[] {
  const activities: PlayerActivity[] = [];
  const timestamp = extractTimestamp(line);

  if (!timestamp) {
    return activities;
  }

  // Test each pattern in priority order
  for (const [activityType, pattern] of Object.entries(ACTIVITY_PATTERNS)) {
    const match = line.match(pattern);
    if (match) {
      const activity = createActivityFromMatch(
        activityType as ActivityType,
        match,
        timestamp,
        line
      );
      if (activity) {
        activities.push(activity);
      }
    }
  }

  return activities;
}
```

## Activity Extraction Specifications

### JOIN Activity Extraction

**Input Pattern**: `[16:34:58] [Server thread/INFO]: MaroonFranc joined the game`

**Enhanced Pattern** (if available): `MaroonFranc[/72.88.209.7:52461] logged in with entity id 57 at ([Ironman]-469.23, 21.06, 1134.51)`

**Extraction Logic**:

```typescript
function extractJoinActivity(
  match: RegExpMatchArray,
  timestamp: Date,
  fullLine: string
): PlayerActivity {
  const [, timeStr, username] = match;

  // Look for enhanced login details in subsequent lines or same line
  const loginMatch = fullLine.match(ENHANCED_PATTERNS.LOGIN_DETAILS);

  const metadata: JoinMetadata = {};

  if (loginMatch) {
    const [, , ipAddress, entityId, dimension, coordStr] = loginMatch;
    metadata.ip_address = ipAddress;
    metadata.entity_id = parseInt(entityId);
    metadata.dimension = dimension;

    // Parse coordinates if available
    const coords = parseCoordinates(coordStr);
    if (coords) {
      metadata.coordinates = coords;
    }
  }

  return {
    id: 0, // Will be assigned by database
    username,
    activity_type: "JOIN",
    timestamp,
    metadata,
    created_at: new Date(),
  };
}
```

### CHAT Activity Extraction

**Input Pattern**: `[19:03:40] [Async Chat Thread - #3/INFO]: <MaroonFranc> hiiiiiiiiiiiiiiiii`

**Extraction Logic**:

```typescript
function extractChatActivity(
  match: RegExpMatchArray,
  timestamp: Date
): PlayerActivity {
  const [, timeStr, username, message] = match;

  const metadata: ChatMetadata = {
    message_length: message.length,
    contains_mention: message.includes("@"),
    thread_info: extractThreadInfo(match[0]), // Extract from full match
  };

  return {
    id: 0,
    username,
    activity_type: "CHAT",
    timestamp,
    metadata,
    created_at: new Date(),
  };
}
```

### ACHIEVEMENT Activity Extraction

**Input Pattern**: `[17:30:46] [Server thread/INFO]: MaroonFranc has made the advancement [Acquire Hardware]`

**Extraction Logic**:

```typescript
function extractAchievementActivity(
  match: RegExpMatchArray,
  timestamp: Date
): PlayerActivity {
  const [, timeStr, username, advancementName] = match;

  const metadata: AchievementMetadata = {
    advancement_name: advancementName,
    advancement_category: categorizeAdvancement(advancementName),
    is_first_time: true, // Could be enhanced with historical checking
  };

  return {
    id: 0,
    username,
    activity_type: "ACHIEVEMENT",
    timestamp,
    metadata,
    created_at: new Date(),
  };
}
```

### DEATH Activity Extraction

**Input Pattern**: `[19:03:48] [Server thread/INFO]: JackL64 drowned`

**Extraction Logic**:

```typescript
function extractDeathActivity(
  match: RegExpMatchArray,
  timestamp: Date
): PlayerActivity {
  const [, timeStr, username, deathCause] = match;

  const metadata: DeathMetadata = {
    cause: deathCause.trim(),
    // Could be enhanced with coordinate extraction if available in logs
  };

  return {
    id: 0,
    username,
    activity_type: "DEATH",
    timestamp,
    metadata,
    created_at: new Date(),
  };
}
```

### LEAVE Activity Extraction

**Input Pattern**: `[16:37:04] [Server thread/INFO]: MaroonFranc left the game`

**Enhanced Pattern**: `[16:37:04] [Server thread/INFO]: MaroonFranc lost connection: Disconnected`

**Extraction Logic**:

```typescript
function extractLeaveActivity(
  match: RegExpMatchArray,
  timestamp: Date,
  fullLine: string
): PlayerActivity {
  const [, timeStr, username] = match;

  const metadata: LeaveMetadata = {};

  // Check for disconnect reason in nearby lines
  const disconnectMatch = fullLine.match(ENHANCED_PATTERNS.DISCONNECT_REASON);
  if (disconnectMatch) {
    metadata.reason = disconnectMatch[2];
  }

  return {
    id: 0,
    username,
    activity_type: "LEAVE",
    timestamp,
    metadata,
    created_at: new Date(),
  };
}
```

## Timestamp Extraction

```typescript
export function extractTimestamp(line: string): Date | null {
  // Extract time from log line: [HH:MM:SS]
  const timeMatch = line.match(/\[(\d{2}):(\d{2}):(\d{2})\]/);
  if (!timeMatch) {
    return null;
  }

  const [, hours, minutes, seconds] = timeMatch;

  // Create timestamp for today with extracted time
  // Note: This assumes logs are from the current day
  // Could be enhanced with date detection for multi-day logs
  const now = new Date();
  const timestamp = new Date();
  timestamp.setHours(parseInt(hours));
  timestamp.setMinutes(parseInt(minutes));
  timestamp.setSeconds(parseInt(seconds));
  timestamp.setMilliseconds(0);

  // Handle day rollover case
  if (timestamp > now) {
    timestamp.setDate(timestamp.getDate() - 1);
  }

  return timestamp;
}
```

## Utility Functions

```typescript
// Parse coordinate strings like "-469.23, 21.06, 1134.51"
export function parseCoordinates(
  coordStr: string
): { x: number; y: number; z: number } | null {
  const match = coordStr.match(
    /(-?\d+\.?\d*),\s*(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/
  );
  if (!match) return null;

  return {
    x: parseFloat(match[1]),
    y: parseFloat(match[2]),
    z: parseFloat(match[3]),
  };
}

// Categorize achievements for analytics
export function categorizeAdvancement(name: string): string {
  const categories: Record<string, string[]> = {
    mining: ["Acquire Hardware", "Isn't It Iron Pick"],
    combat: ["Suit Up", "The Cutest Predator"],
    exploration: ["Adventure", "Cave Dweller"],
    building: ["Architect", "Builder"],
    farming: ["Harvest", "Plant Seed"],
  };

  for (const [category, advancements] of Object.entries(categories)) {
    if (advancements.some((adv) => name.includes(adv))) {
      return category;
    }
  }

  return "misc";
}

// Extract async chat thread information
export function extractThreadInfo(fullMatch: string): string | undefined {
  const threadMatch = fullMatch.match(/Async Chat Thread - #(\d+)/);
  return threadMatch ? `thread-${threadMatch[1]}` : undefined;
}

// Validate log line format
export function isValidLogLine(line: string): boolean {
  // Basic validation: starts with timestamp, contains thread info
  return /^\[\d{2}:\d{2}:\d{2}\].*?\[(Server thread|Async Chat Thread|User Authenticator).*?\]/.test(
    line
  );
}
```

## Error Handling

```typescript
export class LogParseError extends Error {
  constructor(
    message: string,
    public line?: string,
    public lineNumber?: number
  ) {
    super(message);
    this.name = "LogParseError";
  }
}

export function safeParseLogLine(
  line: string,
  lineNumber?: number
): PlayerActivity[] {
  try {
    if (!isValidLogLine(line)) {
      return [];
    }

    return parseLogLine(line);
  } catch (error) {
    console.warn(
      `Failed to parse log line ${lineNumber || "unknown"}: ${error.message}`
    );
    console.debug(`Problematic line: ${line}`);
    return [];
  }
}
```

## Integration Contract

### With ActivityService

```typescript
// Example integration in log monitoring loop
export async function processNewLogContent(
  content: string,
  activityService: IActivityService
): Promise<void> {
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const activities = safeParseLogLine(line, i + 1);

    for (const activity of activities) {
      try {
        await activityService.recordActivity(activity);
      } catch (error) {
        if (error instanceof RateLimitExceededError) {
          // Expected, just skip
          continue;
        }
        console.warn(
          `Failed to record activity from line ${i + 1}: ${error.message}`
        );
      }
    }
  }
}
```

### Performance Requirements

- **Line Processing**: <1ms per log line for typical activity detection
- **Memory Usage**: Process logs in streaming fashion, don't load entire file
- **Error Recovery**: Continue processing after malformed lines
- **Pattern Efficiency**: Use compiled regex patterns, avoid repeated compilation

### Testing Requirements

Each pattern must be tested with:

- Sample log lines from actual Minecraft servers
- Edge cases (malformed lines, unusual player names, special characters)
- Performance tests with large log files
- Concurrent parsing scenarios
