# Tasks: Daily Death Leaderboard

**Input**: Design documents from `/specs/002-daily-death-leaderboard/`
**Prerequisites**: plan.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

## Execution Flow (main)

```
1. Load plan.md from feature directory
   → If not found: ERROR "No implementation plan found"
   → Extract: tech stack, libraries, structure
2. Load optional design documents:
   → data-model.md: Extract entities → model tasks
   → contracts/: Each file → contract test task
   → research.md: Extract decisions → setup tasks
3. Generate tasks by category:
   → Setup: project init, dependencies, linting
   → Tests: contract tests, integration tests
   → Core: models, services, CLI commands
   → Integration: DB, middleware, logging
   → Polish: unit tests, performance, docs
4. Apply task rules:
   → Different files = mark [P] for parallel
   → Same file = sequential (no [P])
   → Tests before implementation (TDD)
5. Number tasks sequentially (T001, T002...)
6. Generate dependency graph
7. Create parallel execution examples
8. Validate task completeness:
   → All contracts have tests?
   → All entities have models?
   → All endpoints implemented?
9. Return: SUCCESS (tasks ready for execution)
```

## Format: `[ID] [P?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root (per plan.md)
- TypeScript 5.9.2 with Node.js, discord.js 14.22.1
- JSON file-based persistence (players.json, config.json)

## Phase 3.1: Setup & Type Extensions

- [ ] T001 Extend Player interface with lastSeenTimestamp field in `src/types.ts`
- [ ] T002 Add DailyLeaderboard interfaces (DailyLeaderboard, LeaderboardEntry, SurvivalChampion) in `src/types.ts`
- [ ] T003 Add LeaderboardConfig interface and extend ConfigData in `src/types.ts`

## Phase 3.2: Tests First (TDD) ⚠️ MUST COMPLETE BEFORE 3.3

**CRITICAL: These tests MUST be written and MUST FAIL before ANY implementation**

- [ ] T004 [P] Contract test LeaderboardService.generateLeaderboard() in `src/leaderboardService.test.ts`
- [ ] T005 [P] Contract test SchedulerService timing functions in `src/schedulerService.test.ts`
- [ ] T006 [P] Contract test LeaderboardFormatter.createLeaderboardEmbed() in `src/leaderboardFormatter.test.ts`
- [ ] T007 [P] Integration test complete daily announcement workflow in `src/integration.test.ts`

## Phase 3.3: Core Implementation (ONLY after tests are failing)

- [ ] T008 [P] LeaderboardService class with generateLeaderboard, getSurvivalChampion, getActivePlayers methods in `src/leaderboardService.ts`
- [ ] T009 [P] SchedulerService class with start, stop, isAnnouncementTime, getTimeUntilNextAnnouncement methods in `src/schedulerService.ts`
- [ ] T010 [P] LeaderboardFormatter class with createLeaderboardEmbed, formatSurvivalTime methods in `src/leaderboardFormatter.ts`

## Phase 3.4: Storage & Configuration

- [ ] T011 Extend StorageService to handle LeaderboardConfig persistence and Player.lastSeenTimestamp updates in `src/storage.ts`
- [ ] T012 Add leaderboard configuration initialization with default values in `src/config.ts`
- [ ] T013 Update PlayerTracker to maintain lastSeenTimestamp on any player activity in `src/playerTracker.ts`

## Phase 3.5: Integration & Wiring

- [ ] T014 Wire LeaderboardService and SchedulerService into main bot initialization in `src/bot.ts`
- [ ] T015 Connect daily scheduler trigger to leaderboard generation and Discord announcement in `src/announcer.ts`
- [ ] T016 Add proper error handling and logging for leaderboard operations in all service files
- [ ] T017 Implement data migration for existing players.json to add lastSeenTimestamp field in `src/storage.ts`

## Phase 3.6: Testing & Validation

- [ ] T018 [P] Manual testing following quickstart.md scenarios
- [ ] T019 [P] Performance validation: leaderboard generation <50ms for 20 players
- [ ] T020 [P] Edge case testing: empty leaderboard, all inactive players, tied death counts
- [ ] T021 Verify EST timezone handling and prevent duplicate daily announcements

## Dependencies

**Critical Path**: T001-T003 → T004-T007 → T008-T010 → T011-T013 → T014-T017 → T018-T021

**Specific Dependencies**:

- Types (T001-T003) must complete before ANY other tasks
- Tests (T004-T007) must FAIL before implementation (T008-T010)
- Core services (T008-T010) before storage integration (T011-T013)
- Storage ready before bot integration (T014-T017)
- Implementation complete before testing (T018-T021)

## Parallel Execution Examples

### Phase 3.2 - Contract Tests (After T001-T003)

```
Task: "Contract test LeaderboardService.generateLeaderboard() in src/leaderboardService.test.ts"
Task: "Contract test SchedulerService timing functions in src/schedulerService.test.ts"
Task: "Contract test LeaderboardFormatter.createLeaderboardEmbed() in src/leaderboardFormatter.test.ts"
Task: "Integration test complete daily announcement workflow in src/integration.test.ts"
```

### Phase 3.3 - Core Services (After T004-T007 FAIL)

```
Task: "LeaderboardService class with generateLeaderboard, getSurvivalChampion, getActivePlayers methods in src/leaderboardService.ts"
Task: "SchedulerService class with start, stop, isAnnouncementTime, getTimeUntilNextAnnouncement methods in src/schedulerService.ts"
Task: "LeaderboardFormatter class with createLeaderboardEmbed, formatSurvivalTime methods in src/leaderboardFormatter.ts"
```

### Phase 3.6 - Final Testing (After T014-T017)

```
Task: "Manual testing following quickstart.md scenarios"
Task: "Performance validation: leaderboard generation <50ms for 20 players"
Task: "Edge case testing: empty leaderboard, all inactive players, tied death counts"
```

## Task Implementation Notes

### T001-T003: Type Extensions

- Add to existing `src/types.ts` without breaking existing interfaces
- Follow existing naming conventions and structure
- Ensure backward compatibility with current Player interface

### T004-T007: Contract Tests

- Create failing tests that expect the contract behaviors from `/contracts/`
- Use existing test patterns from the codebase if any exist
- Mock Discord API calls and file system operations
- Tests should validate input/output contracts exactly

### T008-T010: Core Services

- Implement according to contracts in `/contracts/` directory
- Use existing patterns from current services (storage, logger, announcer)
- Handle all error cases gracefully
- Follow constitutional principle: "just make it work"

### T011-T013: Storage Integration

- Extend existing storage patterns rather than replacing
- Maintain backward compatibility with existing data files
- Add validation and migration logic for new fields
- Preserve existing error handling patterns

### T014-T017: Bot Integration

- Wire new services into existing bot lifecycle (startup, shutdown)
- Integrate with existing Discord announcement system
- Add comprehensive logging using existing logger service
- Ensure no breaking changes to existing death announcement functionality

### T018-T021: Validation

- Follow test scenarios from `quickstart.md`
- Validate performance requirements from `data-model.md`
- Test constitutional compliance (simplicity, friend-focused design)
- Verify EST timezone handling accuracy

## Validation Checklist

_GATE: Checked before task execution_

- [x] All contracts have corresponding tests (T004-T006)
- [x] All entities have model tasks (T001-T003, T008-T010)
- [x] All tests come before implementation (T004-T007 → T008-T010)
- [x] Parallel tasks truly independent ([P] tasks use different files)
- [x] Each task specifies exact file path
- [x] No task modifies same file as another [P] task
- [x] Integration test covers complete user story (T007)
- [x] Performance and edge case testing included (T019-T020)

## Success Criteria

- ✅ Bot announces leaderboard daily at 11:59 PM EST
- ✅ All players ranked by death count (ascending) with alphabetical tie-breaking
- ✅ Survival champion shows longest-surviving active player (7-day window)
- ✅ Discord embed displays with proper formatting and emojis
- ✅ No duplicate announcements, state persists across restarts
- ✅ Graceful handling of edge cases (no deaths, all inactive players)
- ✅ Performance: <50ms generation time for friend group scale
- ✅ Constitutional compliance: simple, friend-focused, leverages existing infrastructure
