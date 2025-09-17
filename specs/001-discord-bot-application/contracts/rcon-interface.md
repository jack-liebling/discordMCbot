# RCON Interface Contract (Fallback Service)

**Note**: As of September 17, 2025, the primary death detection mechanism uses FTP log parsing. RCON serves as a fallback for basic server connectivity monitoring and supplementary features.

## RCON Commands (Fallback Usage)

### Server Status Check

**Command**: `list`
**Purpose**: Verify server connectivity and get player count
**Response Format**:

```
There are 3 of a max of 20 players online: Steve, Alex, Herobrine
```

or

```
There are 0 of a max of 20 players online:
```

### Player Experience Query

**Command**: `experience query {username}`  
**Purpose**: Get player's experience level for death announcements (if not available from logs)
**Response Format**:

```
Steve has 42 experience levels
```

or

```
No player was found
```

## Fallback Role in Architecture

### Primary vs Fallback Detection

- **Primary**: FTP log parsing provides real-time death detection with accurate causes
- **Fallback**: RCON connection monitoring ensures server availability
- **Hybrid**: RCON can supplement log data with player experience levels

### When RCON is Used

1. **Server Health Monitoring**: Periodic connectivity checks
2. **Experience Level Queries**: If not extractable from log messages
3. **Fallback Detection**: If FTP log access becomes unavailable
4. **Administrative Commands**: Server management if needed

## Connection Interface

```typescript
interface RconConnection {
  connect(): Promise<void>;
  authenticate(password: string): Promise<void>;
  send(command: string): Promise<string>;
  disconnect(): void;
  isConnected(): boolean;
  healthCheck(): Promise<boolean>;
}
```

## Error Handling

### Connection Errors

- **Timeout**: Log error, continue with FTP-only operation
- **Authentication Failed**: Log error, disable RCON fallback
- **Network Error**: Implement exponential backoff retry for health checks

### Command Errors

- **Unknown Command**: Log warning, continue operation
- **Player Not Found**: Use default/fallback values
- **Malformed Response**: Parse what's possible, log incomplete data

## Rate Limiting

### RCON Command Limits

- Health check every 60 seconds maximum
- Experience queries only when requested by log parser
- No continuous polling (FTP logs provide primary detection)

### Connection Management

- Maintain connection for health monitoring
- Graceful degradation if RCON unavailable
- Primary operation continues via FTP regardless of RCON status
