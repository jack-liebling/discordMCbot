# Tasks: Minecraft Death Announcements Discord Bot

**Input**: Design documents from `/specs/001-discord-bot-application/`
**Prerequisites**: plan.md (required), research.md, data-model.md, contracts/

## Execution Flow (main)

```
1. Load plan.md from feature directory
   → Tech stack: TypeScript, Node.js 18+, discord.ts, minecraft-rcon
   → Structure: Single project with src/ structure
2. Load design documents:
   → data-model.md: DeathEvent, Player, DiscordChannelConfig, RconConfig entities
   → contracts/: Discord messages and RCON interface contracts
   → quickstart.md: Setup and validation test scenarios
3. Generate tasks by category:
   → Setup: TypeScript project, dependencies, environment config
   → Core: Type definitions, storage layer, RCON client, Discord client
   → Integration: Death detection, rate limiting, main bot orchestration
   → Polish: Error handling, logging, documentation
4. Apply task rules:
   → Different files = mark [P] for parallel
   → Same file = sequential (no [P])
   → No formal tests (per constitution - just make it work)
5. Number tasks sequentially (T001, T002...)
6. Generate dependency graph
7. Create parallel execution examples
8. Validate task completeness: All entities, contracts, and features covered
9. Return: SUCCESS (tasks ready for execution)
```

## Format: `[ID] [P?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions

## Path Conventions

Single project structure at repository root:

- `src/` - TypeScript source code
- Configuration files at root level

## Phase 3.1: Setup

- [ ] T001 Create TypeScript project structure with src/, package.json, tsconfig.json
- [ ] T002 Install dependencies: discord.ts, minecraft-rcon, dotenv, typescript, ts-node, @types/node
- [ ] T003 [P] Configure TypeScript compiler and build scripts in package.json

## Phase 3.2: Core Type Definitions

- [ ] T004 [P] DeathEvent and Player interfaces in src/types.ts
- [ ] T005 [P] DiscordChannelConfig and RconConfig interfaces in src/types.ts
- [ ] T006 [P] PlayerState and connection interfaces in src/types.ts

## Phase 3.3: Foundation Layer (ONLY after types are defined)

- [ ] T007 [P] JSON file storage service in src/storage.ts for players.json and config.json
- [ ] T008 [P] Environment configuration loader in src/config.ts reading .env variables
- [ ] T009 [P] Basic logging utility in src/logger.ts for error and debug output

## Phase 3.4: Service Layer

- [ ] T010 [P] RCON client service in src/rcon.ts implementing minecraft-rcon connection
- [ ] T011 [P] Discord message formatter in src/discord.ts creating death announcement embeds
- [ ] T012 [P] Player tracking service in src/playerTracker.ts managing death counts and rate limiting

## Phase 3.5: Core Logic Integration

- [ ] T013 Death detection logic in src/deathDetector.ts integrating RCON polling and player state tracking
- [ ] T014 Rate limiting implementation in src/rateLimiter.ts enforcing 30-second cooldowns per player
- [ ] T015 Discord announcement service in src/announcer.ts sending formatted messages to channels

## Phase 3.6: Main Bot Assembly

- [ ] T016 Main Discord bot client in src/bot.ts setting up discord.ts client and event handlers
- [ ] T017 Bot startup and initialization in src/index.ts coordinating all services
- [ ] T018 Graceful shutdown handling in src/index.ts for cleanup and connection closing

## Phase 3.7: Error Handling & Polish

- [ ] T019 [P] Connection error recovery in src/rcon.ts with exponential backoff retry logic
- [ ] T020 [P] Discord API error handling in src/discord.ts for rate limits and permissions
- [ ] T021 [P] Data corruption recovery in src/storage.ts with backup and validation
- [ ] T022 Environment validation in src/config.ts ensuring all required variables are set

## Dependencies

- T001-T003 (setup) before everything else
- T004-T006 (types) before T007-T022 (all implementation)
- T007-T009 (foundation) before T010-T012 (services)
- T010-T012 (services) before T013-T015 (core logic)
- T013-T015 (core logic) before T016-T018 (main bot)
- Error handling (T019-T022) can run in parallel after their respective base implementations

## Parallel Execution Examples

### Phase 3.2: Type Definitions (All Parallel)

```bash
# Launch T004-T006 together:
Task: "DeathEvent and Player interfaces in src/types.ts"
Task: "DiscordChannelConfig and RconConfig interfaces in src/types.ts"
Task: "PlayerState and connection interfaces in src/types.ts"
```

### Phase 3.3: Foundation Layer (All Parallel)

```bash
# Launch T007-T009 together after types complete:
Task: "JSON file storage service in src/storage.ts for players.json and config.json"
Task: "Environment configuration loader in src/config.ts reading .env variables"
Task: "Basic logging utility in src/logger.ts for error and debug output"
```

### Phase 3.4: Service Layer (All Parallel)

```bash
# Launch T010-T012 together after foundation complete:
Task: "RCON client service in src/rcon.ts implementing minecraft-rcon connection"
Task: "Discord message formatter in src/discord.ts creating death announcement embeds"
Task: "Player tracking service in src/playerTracker.ts managing death counts and rate limiting"
```

### Phase 3.7: Error Handling (Parallel within dependencies)

```bash
# Launch T019-T022 together after base implementations:
Task: "Connection error recovery in src/rcon.ts with exponential backoff retry logic"
Task: "Discord API error handling in src/discord.ts for rate limits and permissions"
Task: "Data corruption recovery in src/storage.ts with backup and validation"
Task: "Environment validation in src/config.ts ensuring all required variables are set"
```

## Notes

- No formal testing framework (per constitution - just make it work)
- Focus on functional implementation with graceful error handling
- Use environment variables for all sensitive configuration
- Implement rate limiting to prevent spam
- Simple file-based persistence for friend group scale
- Commit after each task completion

## Validation Through Quickstart

After all tasks complete, validate using quickstart.md scenarios:

1. Environment setup and dependency installation
2. Bot startup and Discord connection
3. RCON connection to Minecraft server
4. Death detection and announcement posting
5. Rate limiting verification (multiple deaths within 30 seconds)
6. Error recovery testing (network disconnections)

## Task Generation Rules Applied

1. **From Data Model**:

   - DeathEvent → T004 (types)
   - Player → T004 (types), T012 (tracking service)
   - DiscordChannelConfig → T005 (types), T008 (config)
   - RconConfig → T005 (types), T008 (config), T010 (RCON service)

2. **From Contracts**:

   - Discord messages → T011 (Discord formatter)
   - RCON interface → T010 (RCON client)

3. **From Quickstart Scenarios**:

   - Setup steps → T001-T003
   - Validation tests → T016-T018 (main bot functionality)

4. **Constitutional Requirements**:
   - Simple implementation → No testing framework, straightforward file structure
   - Friend-focused → Rate limiting, graceful error handling
   - Single feature → All tasks focused on death announcements only
