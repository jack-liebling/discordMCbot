# Tasks: Enhanced Player Activity Tracking

**Input**: Design documents from `/specs/003-enhance-the-log/`
**Prerequisites**: plan.md (required), research.md, data-model.md, contracts/

## Execution Flow (main)

```
1. Load plan.md from feature directory
   → Tech stack: TypeScript 5.9, Node.js 18+, PostgreSQL, discord.js, ftp
   → Structure: Single project (src/, tests/)
2. Load design documents:
   → data-model.md: PlayerActivity entity, ActivitySession (virtual)
   → contracts/: activity-service.md, log-parser.md
   → research.md: Regex parsing strategy, database extension
3. Generate tasks by category:
   → Setup: database schema, dependencies
   → Tests: contract tests, integration tests (no formal testing framework per constitution)
   → Core: activity parsing, service layer, database operations
   → Integration: logParser.ts extension, database.ts enhancement
   → Polish: validation scenarios, performance optimization
4. Apply task rules:
   → Different files = mark [P] for parallel
   → Same file = sequential (no [P])
   → Manual testing approach per constitution
5. Number tasks sequentially (T001-T022)
6. Generate dependency graph for activity tracking pipeline
7. SUCCESS: Tasks ready for execution
```

## Format: `[ID] [P?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- Manual testing approach per project constitution
- Include exact file paths in descriptions

## Path Conventions

Single project structure: `src/`, repository root per existing codebase

## Phase 3.1: Setup & Schema

- [ ] T001 Create player_activities table migration in src/database.ts
- [ ] T002 Add activity-related TypeScript interfaces to src/types.ts
- [ ] T003 [P] Update package.json dependencies if needed (already complete)

## Phase 3.2: Core Parsing Logic

**CRITICAL: These components handle log parsing and activity detection**

- [ ] T004 [P] Add activity regex patterns to src/logParser.ts (JOIN, LEAVE, CHAT, ACHIEVEMENT patterns)
- [ ] T005 [P] Create activity extraction utilities in src/activityParser.ts (metadata extraction, coordinate parsing)
- [ ] T006 [P] Implement rate limiting for activities in src/rateLimiter.ts (extend existing system)
- [ ] T007 Integrate activity parsing into main parseLogLine method in src/logParser.ts

## Phase 3.3: Service Layer Implementation

- [ ] T008 [P] Create ActivityService class in src/activityService.ts (recordActivity, getPlayerActivities methods)
- [ ] T009 [P] Add activity database operations to src/database.ts (saveActivity, getActivities, session calculations)
- [ ] T010 [P] Extend hybridStorage.ts with activity storage methods for JSON fallback
- [ ] T011 Integrate ActivityService with existing storage systems

## Phase 3.4: Database Integration

- [ ] T012 Add player_activities table creation to database initialization in src/database.ts
- [ ] T013 Create database indices for performance (username, activity_type, timestamp)
- [ ] T014 Add activity cleanup/retention methods to src/database.ts
- [ ] T015 Test database schema with sample activity data

## Phase 3.5: Log Parser Enhancement

- [ ] T016 Extend FTP log monitoring to detect all activity types in src/logParser.ts
- [ ] T017 Add activity batching for database performance in src/logParser.ts
- [ ] T018 Enhance error handling for malformed log entries in src/logParser.ts
- [ ] T019 Update log position tracking to handle activity processing in src/logParser.ts

## Phase 3.6: Integration & Validation

- [ ] T020 Connect activity tracking to existing player management in src/playerTracker.ts
- [ ] T021 Run quickstart validation scenarios (manual testing per constitution)
- [ ] T022 Performance validation and optimization (10-second polling, <1ms per line)

## Dependencies

- Schema setup (T001-T003) before core logic (T004-T007)
- T004-T006 must complete before T007 (parsing integration)
- T008-T010 must complete before T011 (service integration)
- T012-T013 before T014-T015 (database setup before testing)
- T016-T019 sequential (all modify same logParser.ts file)
- All core work (T004-T019) before integration (T020-T022)

## Parallel Example

```
# Launch T004-T006 together (different files, independent):
Task: "Add activity regex patterns to src/logParser.ts (JOIN, LEAVE, CHAT, ACHIEVEMENT patterns)"
Task: "Create activity extraction utilities in src/activityParser.ts (metadata extraction, coordinate parsing)"
Task: "Implement rate limiting for activities in src/rateLimiter.ts (extend existing system)"

# Launch T008-T010 together (different files, independent):
Task: "Create ActivityService class in src/activityService.ts (recordActivity, getPlayerActivities methods)"
Task: "Add activity database operations to src/database.ts (saveActivity, getActivities, session calculations)"
Task: "Extend hybridStorage.ts with activity storage methods for JSON fallback"
```

## Activity Types Implementation Order

Based on complexity and dependencies:

1. **JOIN/LEAVE**: Session foundation, simplest patterns
2. **CHAT**: High frequency, rate limiting critical
3. **ACHIEVEMENT**: Medium complexity, metadata parsing
4. **DEATH**: Enhance existing implementation
5. **Session Calculation**: Virtual entity, depends on JOIN/LEAVE

## File Modification Summary

- **New Files**: `src/activityService.ts`, `src/activityParser.ts`
- **Enhanced Files**: `src/logParser.ts`, `src/database.ts`, `src/hybridStorage.ts`, `src/rateLimiter.ts`, `src/types.ts`, `src/playerTracker.ts`
- **No Breaking Changes**: Maintain backward compatibility with existing death tracking

## Validation Approach (Per Constitution)

Manual testing using quickstart.md scenarios:

- Player join → activity recorded
- Chat message → activity logged (no content stored)
- Achievement unlock → advancement tracked
- Player death → enhanced death tracking
- Player leave → session duration calculated
- Rate limiting → duplicate activities filtered
- Database fallback → JSON storage when database unavailable

## Task Generation Rules Applied

1. **From activity-service.md contract**: T008 (ActivityService), T009 (database operations), T010 (hybrid storage)
2. **From log-parser.md contract**: T004 (regex patterns), T005 (extraction utilities), T007 (integration)
3. **From data-model.md**: T001 (PlayerActivity table), T002 (TypeScript interfaces), T012-T013 (schema setup)
4. **From quickstart.md**: T021 (validation scenarios), T022 (performance testing)
5. **From research.md**: T006 (rate limiting), T014 (retention), T017 (batching optimization)

## Constitutional Compliance

- ✅ **Single Feature Focus**: Extends existing death tracking naturally
- ✅ **Just Make It Work**: Builds on proven patterns, minimal complexity
- ✅ **Friend-Focused**: Passive activity collection, no complex commands
- ✅ **No Formal Testing**: Manual validation scenarios instead of test framework
- ✅ **Keep It Simple**: Reuses existing infrastructure, straightforward implementation

## Notes

- Manual testing approach per project constitution (no jest/mocha framework)
- [P] tasks target different files with no dependencies
- Rate limiting configuration per activity type (research findings)
- Database fallback maintains existing hybrid storage pattern
- Performance targets: <1ms per log line, 10-second FTP polling maintained
