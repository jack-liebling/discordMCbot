# Implementation Plan: Enhanced Player Activity Tracking

**Branch**: `003-enhance-the-log` | **Date**: September 17, 2025 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-enhance-the-log/spec.md`

## Execution Flow (/plan command scope)

```
1. Load feature spec from Input path
   → If not found: ERROR "No feature spec at {path}"
2. Fill Technical Context (scan for NEEDS CLARIFICATION)
   → Detect Project Type from context (web=frontend+backend, mobile=app+api)
   → Set Structure Decision based on project type
3. Fill the Constitution Check section based on the content of the constitution document.
4. Evaluate Constitution Check section below
   → If violations exist: Document in Complexity Tracking
   → If no justification possible: ERROR "Simplify approach first"
   → Update Progress Tracking: Initial Constitution Check
5. Execute Phase 0 → research.md
   → If NEEDS CLARIFICATION remain: ERROR "Resolve unknowns"
6. Execute Phase 1 → contracts, data-model.md, quickstart.md, agent-specific template file (e.g., `CLAUDE.md` for Claude Code, `.github/copilot-instructions.md` for GitHub Copilot, or `GEMINI.md` for Gemini CLI).
7. Re-evaluate Constitution Check section
   → If new violations: Refactor design, return to Phase 1
   → Update Progress Tracking: Post-Design Constitution Check
8. Plan Phase 2 → Describe task generation approach (DO NOT create tasks.md)
9. STOP - Ready for /tasks command
```

**IMPORTANT**: The /plan command STOPS at step 7. Phases 2-4 are executed by other commands:

- Phase 2: /tasks command creates tasks.md
- Phase 3-4: Implementation execution (manual or via tools)

## Summary

**Primary Requirement**: Extend existing FTP log parser to track all player activities (JOIN, LEAVE, CHAT, ACHIEVEMENT, DEATH) instead of only death events.

**Technical Approach**: Build on existing logParser.ts and database.ts infrastructure by adding new activity patterns and a player_activities table. Maintain backward compatibility while extending functionality through proven regex parsing and PostgreSQL storage patterns. Use hybrid storage for database fallback and implement activity-specific rate limiting.

## Technical Context

**Language/Version**: TypeScript 5.9 with Node.js 18+ (ES2022 target)  
**Primary Dependencies**: discord.js 14.22, pg 8.16 (PostgreSQL), ftp 0.3.10, dotenv 17.2  
**Storage**: PostgreSQL database via Railway deployment with JSON file fallback (hybridStorage.ts)  
**Testing**: No formal testing framework per constitution (manual testing approach)  
**Target Platform**: Linux server deployment (Railway)  
**Project Type**: Single project - Discord bot with FTP log monitoring  
**Performance Goals**: 10-second FTP log polling, 30-second rate limiting, real-time database persistence  
**Constraints**: Friend group usage (<10 players), minimal memory footprint, graceful error handling  
**Scale/Scope**: Small group Discord bot, 4-5 activity types, single Minecraft server monitoring

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

**✅ I. Single Feature Focus**: Enhanced player activity tracking extends the existing death tracking feature logically without introducing completely new functionality domains.

**✅ II. Friend-Focused Design**: Activity tracking provides valuable insight for friend groups without complex commands - all activity is passively collected and stored for future analytics.

**✅ III. Just Make It Work**: Focus on extending existing FTP log parsing with new event types rather than rebuilding architecture. Reuse existing database schema where possible.

**✅ IV. Safety and Moderation**: Rate limiting already exists for deaths, can be extended to other activities. Database persistence prevents spam on bot restart.

**✅ V. Keep It Simple**: Building on existing logParser.ts and database.ts structure. New activity types follow same patterns as death detection.

**Gate Status**: ✅ PASS - No constitutional violations identified. Feature extends existing functionality naturally without adding complexity.

## Project Structure

### Documentation (this feature)

```
specs/[###-feature]/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (/plan command)
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)

```
# Option 1: Single project (DEFAULT)
src/
├── models/
├── services/
├── cli/
└── lib/

tests/
├── contract/
├── integration/
└── unit/

# Option 2: Web application (when "frontend" + "backend" detected)
backend/
├── src/
│   ├── models/
│   ├── services/
│   └── api/
└── tests/

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   └── services/
└── tests/

# Option 3: Mobile + API (when "iOS/Android" detected)
api/
└── [same as backend above]

ios/ or android/
└── [platform-specific structure]
```

**Structure Decision**: [DEFAULT to Option 1 unless Technical Context indicates web/mobile app]

## Phase 0: Outline & Research

1. **Extract unknowns from Technical Context** above:

   - For each NEEDS CLARIFICATION → research task
   - For each dependency → best practices task
   - For each integration → patterns task

2. **Generate and dispatch research agents**:

   ```
   For each unknown in Technical Context:
     Task: "Research {unknown} for {feature context}"
   For each technology choice:
     Task: "Find best practices for {tech} in {domain}"
   ```

3. **Consolidate findings** in `research.md` using format:
   - Decision: [what was chosen]
   - Rationale: [why chosen]
   - Alternatives considered: [what else evaluated]

**Output**: research.md with all NEEDS CLARIFICATION resolved

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

- Load `.specify/templates/tasks-template.md` as base structure
- Generate database schema tasks from data-model.md (CREATE TABLE, indices)
- Generate parsing tasks from log-parser contract (regex patterns, extraction functions)
- Generate service layer tasks from activity-service contract (ActivityService implementation)
- Generate integration tasks from existing codebase analysis (logParser.ts extension, database.ts enhancement)
- Each contract interface → corresponding implementation task [P]
- Each database table → migration and model creation task [P]
- Integration points → connection tasks (sequential dependencies)

**Ordering Strategy**:

- **Phase 1**: Database schema setup (player_activities table, indices)
- **Phase 2**: Core parsing logic (extend existing regex patterns) [P]
- **Phase 3**: Activity service implementation (recording, retrieval) [P]
- **Phase 4**: Rate limiting enhancement (extend existing system)
- **Phase 5**: Integration (connect parser → service → database)
- **Phase 6**: Testing and validation (quickstart scenarios)

**Estimated Output**: 18-22 numbered, ordered tasks in tasks.md with clear dependencies

**Key Parallel Tasks** [P]:

- Activity pattern development (independent regex work)
- Service method implementation (independent of parsing)
- Database query optimization (independent of service layer)
- Metadata extraction utilities (independent functions)

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

- [x] Initial Constitution Check: PASS
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved
- [x] Complexity deviations documented

---

_Based on Constitution v2.1.1 - See `/memory/constitution.md`_
