# Tasks: Player Session Notifications with @Crafters Role Mentions

**Input**: Design documents from `/specs/004-bot-mentions-crafters/`
**Prerequisites**: plan.md, research.md, data-model.md, contracts/, quickstart.md

## Execution Flow (main)

```
1. Load plan.md from feature directory
   → Tech stack: TypeScript 5.9, Node.js 18+, discord.js 14.22, PostgreSQL
   → Structure: Single project - Discord bot extension
2. Load design documents:
   → data-model.md: PlayerSessionState, NotificationMessage, SessionCooldown entities
   → contracts/: 4 service extension contracts
   → research.md: FTP log parsing extension decisions
   → quickstart.md: 5 test scenarios for validation
3. Generate tasks by category:
   → Setup: database migration, configuration
   → Tests: contract tests, integration tests from quickstart scenarios
   → Core: service extensions, new notification service
   → Integration: log parser wiring, bot initialization
   → Polish: cleanup, validation testing
4. Apply task rules:
   → Different files = mark [P] for parallel
   → Same file = sequential (no [P])
   → Tests before implementation (TDD)
5. Number tasks sequentially (T001, T002...)
```

## Format: `[ID] [P?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions

## Phase 3.1: Setup & Database Schema

- [ ] T001 Create database migration `migrations/004-session-notifications.sql` with player_session_notifications and player_session_cooldowns tables
- [ ] T002 [P] Add session notification configuration variables to `src/config.ts` (SESSION_NOTIFICATIONS_ENABLED, CRAFTERS_ROLE_ID, WHO_IS_ON_CHANNEL_ID, SESSION_COOLDOWN_SECONDS)
- [ ] T003 Run database migration and verify schema creation

## Phase 3.2: Tests First (TDD) ⚠️ MUST COMPLETE BEFORE 3.3

**CRITICAL: These tests MUST be written and MUST FAIL before ANY implementation**

- [ ] T004 [P] Contract test for SessionNotificationService.handlePlayerJoin() in `tests/contract/test_session_notification_service.js`
- [ ] T005 [P] Contract test for SessionNotificationService.handlePlayerLeave() in `tests/contract/test_session_notification_service_leave.js`
- [ ] T006 [P] Contract test for database session CRUD operations in `tests/contract/test_database_session_extension.js`
- [ ] T007 [P] Contract test for log parser JOIN/LEAVE detection in `tests/contract/test_log_parser_extension.js`
- [ ] T008 [P] Contract test for Discord service session notifications in `tests/contract/test_discord_service_extension.js`
- [ ] T009 [P] Integration test for basic join notification with delayed deletion (Scenario 1) in `tests/integration/test_join_notification_lifecycle.js`
- [ ] T010 [P] Integration test for cooldown protection (Scenario 2) in `tests/integration/test_cooldown_protection.js`
- [ ] T011 [P] Integration test for multiple players (Scenario 3) in `tests/integration/test_multiple_players.js`
- [ ] T012 [P] Integration test for error recovery (Scenario 4) in `tests/integration/test_error_recovery.js`

## Phase 3.3: Core Implementation (ONLY after tests are failing)

- [ ] T013 [P] Extend database service with session notification CRUD operations in `src/database.ts` (recordSessionNotification, findActiveJoinNotification, markNotificationDeleted, cleanupExpiredNotifications)
- [ ] T014 [P] Extend database service with cooldown management in `src/database.ts` (checkSessionCooldown, updateSessionCooldown)
- [ ] T015 [P] Extend log parser with JOIN/LEAVE event detection patterns in `src/logParser.ts` (addSessionEventCallback, parseSessionEvents)
- [ ] T016 [P] Extend Discord service with session notification posting in `src/discord.ts` (postSessionNotification, deleteSessionNotification, createJoinEmbed)
- [ ] T017 Create SessionNotificationService in `src/sessionNotificationService.ts` (handlePlayerJoin, handlePlayerLeave, checkCooldown, scheduleMessageDeletion)
- [ ] T018 Add session notification types and interfaces to `src/types.ts` (SessionEvent, NotificationRecord, CooldownStatus, SessionChannelConfig)

## Phase 3.4: Integration & Wiring

- [ ] T019 Wire session notification service to log parser events in `src/bot.ts` (initialize service, register callbacks)
- [ ] T020 Add session notification initialization to main bot startup in `src/bot.ts` (load config, validate permissions, start service)
- [ ] T021 Add error handling and logging for session notifications in `src/logger.ts` (session notification log categories)
- [ ] T022 Add session notification cleanup job to scheduled tasks in `src/schedulerService.ts` (expired notification cleanup)

## Phase 3.5: Polish & Validation

- [ ] T023 [P] Add unit tests for JOIN embed formatting in `tests/unit/test_join_embed_formatting.js`
- [ ] T024 [P] Add unit tests for cooldown calculation logic in `tests/unit/test_cooldown_logic.js`
- [ ] T025 [P] Performance test: process 100 rapid join/leave events in <30 seconds in `tests/performance/test_session_event_volume.js`
- [ ] T026 [P] Update project documentation with session notification feature in `README.md`
- [ ] T027 Execute quickstart.md testing scenarios manually (all 5 scenarios)
- [ ] T028 Cleanup: remove debug logging and finalize error messages

## Dependencies

- Database migration (T001) before all database operations (T013-T014)
- Configuration (T002) before service implementation (T017)
- Tests (T004-T012) before implementation (T013-T018)
- Core services (T013-T018) before integration (T019-T022)
- Integration before polish (T023-T028)
- T015 (log parser) blocks T019 (wiring)
- T016 (Discord service) blocks T017 (notification service)
- T017 (notification service) blocks T019 (bot integration)

## Parallel Example

```
# Launch T004-T008 together (contract tests):
Task: "Contract test for SessionNotificationService.handlePlayerJoin() in tests/contract/test_session_notification_service.js"
Task: "Contract test for SessionNotificationService.handlePlayerLeave() in tests/contract/test_session_notification_service_leave.js"
Task: "Contract test for database session CRUD operations in tests/contract/test_database_session_extension.js"
Task: "Contract test for log parser JOIN/LEAVE detection in tests/contract/test_log_parser_extension.js"
Task: "Contract test for Discord service session notifications in tests/contract/test_discord_service_extension.js"

# Launch T013-T016 together (service extensions):
Task: "Extend database service with session notification CRUD operations in src/database.ts"
Task: "Extend database service with cooldown management in src/database.ts"
Task: "Extend log parser with JOIN/LEAVE event detection patterns in src/logParser.ts"
Task: "Extend Discord service with session notification posting in src/discord.ts"
```

## Task Generation Rules Applied

1. **From Contracts**: Each of 4 contract files → contract test task [P] (T004-T008)
2. **From Data Model**: 3 entities → database extension tasks (T013-T014, T018)
3. **From Quickstart Scenarios**: 5 scenarios → 4 integration tests [P] (T009-T012) + manual validation (T027)
4. **From Research**: FTP log parsing extension → log parser task (T015)
5. **Ordering**: Setup → Tests → Extensions → New Services → Integration → Polish

## Validation Checklist

- [x] All 4 contracts have corresponding tests (T004-T008)
- [x] All 3 entities have database implementation (T013-T014, T018)
- [x] All tests come before implementation (Phase 3.2 before 3.3)
- [x] Parallel tasks truly independent (different files)
- [x] Each task specifies exact file path
- [x] No task modifies same file as another [P] task (except database.ts gets T013+T014 sequentially)
- [x] Constitutional requirement: "just make it work" - no complex testing framework, focus on functional validation

## Notes

- No formal testing framework per constitutional requirements - tests are simple functional validation
- Focus on extending existing codebase rather than creating new architecture
- Session notifications gracefully degrade if disabled or misconfigured
- 2-minute delayed deletion uses setTimeout for simplicity (not production-grade job queue)
- All tasks designed to be completed by single developer following existing code patterns
