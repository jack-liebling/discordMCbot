# Log Parser Extension Contract

**Component**: LogParserService  
**Extension**: JOIN/LEAVE event detection for session notifications

## Extension Interface

### New Methods

#### `addSessionEventCallback(callback: SessionEventCallback): void`

**Purpose**: Register callback for JOIN/LEAVE events  
**Parameters**:

- `callback`: Function called when session events detected

```typescript
type SessionEventCallback = (event: SessionEvent) => void;

interface SessionEvent {
  type: "JOIN" | "LEAVE";
  username: string;
  timestamp: Date;
  rawLogLine: string;
}
```

### Enhanced Parsing Patterns

#### JOIN Event Patterns

```typescript
const JOIN_PATTERNS = [
  /^\[(\d{2}:\d{2}:\d{2})\] \[Server thread\/INFO\]: (\w+) joined the game$/,
  /^\[(\d{2}:\d{2}:\d{2})\] \[Server thread\/INFO\]: (\w+)\[\/[\d.:]+\] logged in with entity id \d+/,
];
```

#### LEAVE Event Patterns

```typescript
const LEAVE_PATTERNS = [
  /^\[(\d{2}:\d{2}:\d{2})\] \[Server thread\/INFO\]: (\w+) left the game$/,
  /^\[(\d{2}:\d{2}:\d{2})\] \[Server thread\/INFO\]: (\w+) lost connection: (.+)$/,
];
```

## Integration Contract

### Existing Method Extension: `parseLogLines(lines: string[]): void`

**Enhanced Behavior**:

- Process each line for existing death events (unchanged)
- Additionally check each line for JOIN/LEAVE patterns
- Call session event callback when patterns match
- Maintain existing performance characteristics

### Pattern Matching Logic

```typescript
private parseSessionEvents(logLine: string): SessionEvent | null {
  // Try JOIN patterns
  for (const pattern of JOIN_PATTERNS) {
    const match = pattern.exec(logLine);
    if (match) {
      return {
        type: 'JOIN',
        username: match[2],
        timestamp: this.parseTimestamp(match[1]),
        rawLogLine: logLine
      };
    }
  }

  // Try LEAVE patterns
  for (const pattern of LEAVE_PATTERNS) {
    const match = pattern.exec(logLine);
    if (match) {
      return {
        type: 'LEAVE',
        username: match[2],
        timestamp: this.parseTimestamp(match[1]),
        rawLogLine: logLine
      };
    }
  }

  return null;
}
```

## Validation Requirements

### Input Validation

- Log lines must be non-empty strings
- Timestamps must be valid time format (HH:MM:SS)
- Usernames must match Minecraft username constraints (alphanumeric + underscore, 3-16 chars)

### Output Guarantees

- SessionEvent timestamps are always valid Date objects
- Usernames are sanitized and validated
- Raw log lines are preserved for debugging
- Events are only emitted for successfully parsed data

## Performance Contract

### Processing Requirements

- Session event parsing adds <1ms per log line
- Memory usage increases by <100KB for pattern storage
- No blocking operations in parsing logic
- Callback execution is asynchronous (fire-and-forget)

### Error Handling

- Invalid log lines are skipped silently
- Malformed timestamps logged as warnings
- Callback exceptions don't stop log processing
- Pattern matching failures don't affect death event parsing

## Backward Compatibility

### Existing Functionality

- Death event parsing remains unchanged
- Existing callback system continues to work
- Performance characteristics maintained
- No breaking changes to public API

### New Functionality

- Session event callbacks are optional
- Can be added without affecting existing callers
- Graceful degradation if no session callbacks registered

## Testing Contract

### Unit Tests Required

- JOIN pattern matching with various log formats
- LEAVE pattern matching with various disconnect reasons
- Timestamp parsing accuracy
- Username extraction and validation
- Callback invocation with correct event data

### Integration Tests Required

- Session events detected from real Minecraft log samples
- Multiple events in single log batch processed correctly
- Interleaving of death events and session events
- Error conditions don't break overall log processing

### Performance Tests Required

- Process 1000 log lines with session parsing in <100ms
- Memory usage remains stable over extended operation
- No memory leaks from pattern matching or callback management
