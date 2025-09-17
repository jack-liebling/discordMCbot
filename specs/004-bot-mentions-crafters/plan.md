# Implementation Plan: Player Online Notifications with Crafters Role Mentions

**Branch**: `004-bot-mentions-crafters` | **Date**: September 17, 2025 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-bot-mentions-crafters/spec.md`

## Execution Flow (/plan command scope)

```
1. Load feature spec from Input path
   → ✅ Feature spec loaded successfully
2. Fill Technical Context (scan for NEEDS CLARIFICATION)
   → Detect Project Type from context (Discord bot with existing codebase)
   → Set Structure Decision based on project type
3. Fill the Constitution Check section based on the content of the constitution document.
4. Evaluate Constitution Check section below
   → No violations detected: PASS
   → Update Progress Tracking: Initial Constitution Check
5. Execute Phase 0 → research.md
   → All technical context clear - proceed to research
6. Execute Phase 1 → contracts, data-model.md, quickstart.md, agent-specific template file
7. Re-evaluate Constitution Check section
   → No new violations: PASS
   → Update Progress Tracking: Post-Design Constitution Check
8. Plan Phase 2 → Describe task generation approach (DO NOT create tasks.md)
9. STOP - Ready for /tasks command
```

**IMPORTANT**: The /plan command STOPS at step 7. Phases 2-4 are executed by other commands:

- Phase 2: /tasks command creates tasks.md
- Phase 3-4: Implementation execution (manual or via tools)

## Summary

Primary requirement: Real-time Discord notifications in "who-is-on" channel when players join Minecraft server, with @Crafters role mentions and automatic message deletion 2 minutes after player leaves. Includes cooldown protection against notification spam. Technical approach: Extend existing FTP log parsing system to detect JOIN/LEAVE events and integrate with Discord messaging API for notification lifecycle management.

## Technical Context

**Language/Version**: TypeScript 5.9 with Node.js 18+  
**Primary Dependencies**: discord.js 14.22, existing FTP client, PostgreSQL via Railway  
**Storage**: PostgreSQL database (existing) with new player_session_notifications table  
**Testing**: No formal testing framework (constitutional requirement: "just make it work")  
**Target Platform**: Linux server deployment (Railway/similar)  
**Project Type**: Single project - Discord bot extension  
**Performance Goals**: Real-time notification delivery (<10s from server event to Discord message)  
**Constraints**: 2-minute delayed deletion after LEAVE events, Discord API rate limits  
**Scale/Scope**: Small friend group usage (~10-20 players max), simple feature addition to existing codebase

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

### I. Single Feature Focus ✅

- This extends the existing death tracking bot with one focused feature
- Builds on established FTP log parsing infrastructure
- Clear scope: JOIN notifications with delayed deletion only

### II. Friend-Focused Design ✅

- Automatic notifications help friends know when others are online
- No complex commands required - fully automated
- Clean message lifecycle (post on join, delayed delete after leave)

### III. Just Make It Work ✅

- Leverage existing infrastructure (FTP parsing, database, Discord client)
- Simple implementation approach using proven patterns
- Direct integration with current architecture

### IV. Safety and Moderation ✅

- 2-minute cooldown prevents spam from rapid join/leave cycles
- 2-minute delayed deletion prevents notification spam
- Graceful handling of missing @Crafters role
- Respects Discord API rate limits

### V. Keep It Simple ✅

- Reuses existing log parsing patterns for JOIN/LEAVE events
- Single notification type (JOIN only) with delayed cleanup
- Minimal new code surface area

**GATE STATUS: PASS** - No constitutional violations detected

## Project Structure

### Documentation (this feature)

```
specs/004-bot-mentions-crafters/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (/plan command)
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)

```
src/
├── models/              # Existing
├── services/            # Existing
├── types.ts            # Extend with new interfaces
├── logParser.ts        # Extend with JOIN/LEAVE detection
├── playerTracker.ts    # Extend with session tracking
├── database.ts         # Extend with notification storage
├── announcer.ts        # Extend with online notifications
└── sessionNotifier.ts  # NEW - notification lifecycle management
```

**Structure Decision**: Option 1 (Single project) - Extending existing Discord bot codebase

## Phase 0: Outline & Research

1. **Extract unknowns from Technical Context** above:

   - ✅ All technical context is clear - leveraging existing proven architecture
   - ✅ JOIN/LEAVE log patterns identified from Minecraft server logs
   - ✅ Discord message deletion patterns and error handling approaches researched

2. **Generate and dispatch research agents**:

   ```
   ✅ Task: "Research Minecraft server JOIN/LEAVE log patterns for existing FTP parser"
   ✅ Task: "Find Discord.js best practices for message lifecycle management (post/delete)"
   ✅ Task: "Review existing cooldown/rate limiting patterns in current codebase"
   ```

3. **Consolidate findings** in `research.md`:
   - ✅ Decision: Extend existing log parsing with JOIN/LEAVE patterns
   - ✅ Rationale: Leverage proven FTP infrastructure, use message ID tracking
   - ✅ Alternatives considered: RCON polling, memory-only tracking (both rejected)

**Output**: ✅ research.md with implementation approach decisions

## Phase 1: Design & Contracts

_Prerequisites: research.md complete_

1. **Extract entities from feature spec** → `data-model.md`:

   - Entity name, fields, relationships
   - Validation rules from requirements
   - State transitions if applicable

2. **Generate API contracts** from functional requirements:

   - For each user action → endpoint
   - Use standard REST/GraphQL patterns
   - Output OpenAPI/GraphQL schema to `/contracts/`

3. **Generate contract tests** from contracts:

   - One test file per endpoint
   - Assert request/response schemas
   - Tests must fail (no implementation yet)

4. **Extract test scenarios** from user stories:

   - Each story → integration test scenario
   - Quickstart test = story validation steps

5. **Update agent file incrementally** (O(1) operation):
   - Run `.specify/scripts/bash/update-agent-context.sh copilot` for your AI assistant
   - If exists: Add only NEW tech from current plan
   - Preserve manual additions between markers
   - Update recent changes (keep last 3)
   - Keep under 150 lines for token efficiency
   - Output to repository root

**Output**: data-model.md, /contracts/\*, failing tests, quickstart.md, agent-specific file

## Phase 2: Task Planning Approach

_This section describes what the /tasks command will do - DO NOT execute during /plan_

**Task Generation Strategy**:

- Extend existing Discord bot codebase components rather than creating new parallel systems
- Each task modifies existing files to add session notification capabilities alongside current death tracking
- Follow established architectural patterns from existing codebase (database, logging, error handling)
- Prioritize graceful degradation and constitutional compliance (simple, friend-focused operation)

**Implementation Task Breakdown**:

1. **Database Migration**: Create `migrations/004-session-notifications.sql` with session tracking tables
2. **LogParser Extension**: Modify `src/logParser.ts` to detect JOIN/LEAVE events with callback system
3. **Database Service Extension**: Extend `src/database.ts` with session CRUD operations and cooldown management
4. **Discord Service Extension**: Enhance `src/discord.ts` with session embed formatting and message lifecycle
5. **Session Notification Service**: Create `src/sessionNotificationService.ts` implementing service contracts
6. **Configuration Extension**: Modify `src/config.ts` to load session notification settings with validation
7. **Bot Integration**: Update `src/bot.ts` to initialize session service and wire event handlers
8. **Validation Testing**: Add session processing to main flow with error recovery and logging

**Ordering Strategy**:

- Dependency order: Database migration → Service extensions → New service → Integration → Testing
- Each task includes validation criteria from quickstart.md for immediate functional verification
- Incremental approach allows testing at each step following constitutional "make it work" principle

**Estimated Output**: 8-10 numbered, sequenced tasks in tasks.md focusing on extension rather than rewrite

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Phase 3+: Future Implementation

_These phases are beyond the scope of the /plan command_

**Phase 3**: Task execution (/tasks command creates tasks.md)  
**Phase 4**: Implementation (execute tasks.md following constitutional principles)  
**Phase 5**: Validation (run tests, execute quickstart.md, performance validation)

## Complexity Tracking

_Fill ONLY if Constitution Check has violations that must be justified_

| Violation                  | Why Needed         | Simpler Alternative Rejected Because |
| -------------------------- | ------------------ | ------------------------------------ |
| [e.g., 4th project]        | [current need]     | [why 3 projects insufficient]        |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient]  |

## Progress Tracking

_This checklist is updated during execution flow_

**Phase Status**:

- [x] Phase 0: Research complete (/plan command)
- [x] Phase 1: Design complete (/plan command)
- [x] Phase 2: Task planning complete (/plan command - describe approach only)
- [ ] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:

- [ ] Initial Constitution Check: PASS
- [ ] Post-Design Constitution Check: PASS
- [ ] All NEEDS CLARIFICATION resolved
- [ ] Complexity deviations documented

---

_Based on Constitution v2.1.1 - See `/memory/constitution.md`_
