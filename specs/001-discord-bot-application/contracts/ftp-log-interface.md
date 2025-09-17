# FTP Log Interface Contract

## FTP Connection Configuration

### Connection Parameters

```typescript
interface FtpConfig {
  host: string; // FTP server hostname (e.g., "6402.node.apexhosting.gdn")
  port: number; // FTP port (typically 21)
  user: string; // FTP username
  password: string; // FTP password
  logPath: string; // Path to log file (e.g., "/logs/latest.log")
  checkInterval: number; // Polling interval in seconds (default: 10)
}
```

### Connection Management

```typescript
interface FtpConnection {
  connect(): Promise<void>;
  disconnect(): void;
  downloadLogFile(): Promise<string>;
  isConnected(): boolean;
}
```

## Log Parsing and Death Detection

### Death Message Patterns

The system recognizes Minecraft death messages from server logs:

```
[HH:mm:ss] [Server thread/INFO]: PlayerName was slain by Zombie
[HH:mm:ss] [Server thread/INFO]: PlayerName drowned
[HH:mm:ss] [Server thread/INFO]: PlayerName tried to swim in lava
[HH:mm:ss] [Server thread/INFO]: PlayerName fell from a high place
[HH:mm:ss] [Server thread/INFO]: PlayerName was shot by Skeleton
```

### Death Message Regex Patterns

```typescript
const DEATH_PATTERNS = [
  /\[(\d{2}:\d{2}:\d{2})\] \[Server thread\/INFO\]: (\w+) (.+)/,
  // Additional patterns for different server configurations
];

const DEATH_KEYWORDS = [
  "was slain by",
  "drowned",
  "fell from",
  "was shot by",
  "tried to swim in lava",
  "was killed by",
  "died",
  "went up in flames",
  "was blown up",
  "suffocated",
];
```

### Log Position Tracking

```typescript
interface LogProcessingState {
  lastProcessedPosition: number; // Byte position in log file
  lastProcessedTimestamp: string; // ISO timestamp of last processing
  lastUpdateTime: string; // When state was last updated
}
```

## Death Detection Logic

### Log Monitoring Flow

1. **Connect to FTP**: Establish connection to Minecraft server FTP
2. **Load State**: Retrieve last processed log position from storage
3. **Download Log**: Get current log file content via FTP
4. **Parse New Content**: Process only new lines since last position
5. **Extract Deaths**: Parse death messages using regex patterns
6. **Save State**: Update processed position to prevent duplicates
7. **Rate Limit**: Apply 30-second cooldown per player
8. **Announce**: Send death notifications to Discord

### New Line Processing

```typescript
function getNewLines(logContent: string, lastPosition: number): string[] {
  // Handle log rotation - if file is smaller, start from beginning
  if (logContent.length < lastPosition) {
    lastPosition = 0;
  }

  // Extract only new content
  const newContent = logContent.substring(lastPosition);
  return newContent.split("\n").filter((line) => line.trim().length > 0);
}
```

### Death Event Extraction

```typescript
interface DeathEvent {
  playerId: string; // Player who died
  cause: string; // Cause of death from log message
  timestamp: Date; // When death occurred (server time)
  experienceLevel?: number; // Player's XP level (if available)
}

function parseDeathMessage(logLine: string): DeathEvent | null {
  for (const pattern of DEATH_PATTERNS) {
    const match = logLine.match(pattern);
    if (match && containsDeathKeyword(match[3])) {
      return {
        playerId: match[2],
        cause: match[3],
        timestamp: parseLogTimestamp(match[1]),
      };
    }
  }
  return null;
}
```

## Error Handling

### FTP Connection Errors

- **Connection Timeout**: Retry with exponential backoff (max 3 attempts)
- **Authentication Failed**: Log error and stop service
- **File Not Found**: Log warning, continue monitoring
- **Network Interruption**: Auto-reconnect on next polling cycle

### Log Processing Errors

- **Malformed Log Lines**: Skip line, continue processing
- **Timestamp Parse Error**: Use current time as fallback
- **Unknown Death Pattern**: Log for analysis, skip event
- **File Rotation**: Detect and restart from position 0

### State Persistence Errors

- **Save Failure**: Log error but continue operation
- **Load Failure**: Start from position 0 (full log scan)
- **Corrupted State**: Reset to clean state

## Rate Limiting and Duplicate Prevention

### Player Rate Limiting

- Track last death time per player
- Ignore deaths within 30 seconds of previous death
- Rate limiting persists across bot restarts

### Duplicate Prevention

- Save log file position after each processing cycle
- On bot restart, resume from saved position
- Handle log rotation by detecting file size decrease
- Prevent re-announcing historical deaths

### Performance Considerations

- Poll log file every 10 seconds (configurable)
- Process only new content since last check
- Maintain persistent FTP connection when possible
- Graceful handling of large log files (chunked processing)
