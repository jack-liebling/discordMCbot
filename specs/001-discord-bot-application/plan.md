# Implementation Plan: Minecraft Discord bot that monitors a Minecraft server via FTP log parsing and announces player deaths in a designated Discord channel. Each announcement includes player name, actual cause of death from server logs, timestamp, experience level, and total death count. Uses discord.js for Discord bot framework with file-based storage for death tracking and log position persistence to prevent duplicate announcements. FTP access to server logs is required.Announcements Discord Bot

**Branch**: `001-discord-bot-application` | **Date**: September 16, 2025 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-discord-bot-application/spec.md`

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

Discord bot that monitors a Minecraft server via RCON and announces player deaths in a designated Discord channel. Each announcement includes player name, cause of death, timestamp, experience level, and total death count. Uses discord.ts for Discord bot framework with simple file-based storage for death tracking.

## Technical Context

**Language/Version**: TypeScript with Node.js 18+  
**Primary Dependencies**: discord.js for Discord bot framework, FTP client for log access  
**Storage**: JSON file-based storage for death count persistence and log position tracking  
**Testing**: No testing framework (per constitution - just make it work)  
**Target Platform**: Node.js server environment  
**Project Type**: single - Discord bot application  
**Performance Goals**: Real-time death detection and announcement (under 10 seconds from log write)  
**Constraints**: Friend group usage only, single channel announcements, 30-second rate limiting per player, FTP access to server logs required  
**Scale/Scope**: Small friend group (5-10 players), single Minecraft server, single Discord server

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

Based on the Discord MC Bot Constitution:

✅ **Single Feature Focus**: PASS - Implementing only death announcements feature  
✅ **Friend-Focused Design**: PASS - Simple announcements for friend group enjoyment  
✅ **Just Make It Work**: PASS - Functional over perfect, using established libraries  
✅ **Safety and Moderation**: PASS - 30-second rate limiting, graceful error handling  
✅ **Keep It Simple**: PASS - TypeScript with discord.ts, minimal dependencies  
✅ **Code Organization**: PASS - Single feature, environment variables for tokens  
✅ **Error Handling**: PASS - Graceful connection handling, basic error messages  
✅ **Security**: PASS - Bot tokens in environment, minimal data collection

**Result**: All constitutional requirements satisfied, no complexity violations

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

**Structure Decision**: Option 1 (Single project) - Discord bot application with simple Node.js structure

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

- Load `.specify/templates/tasks-template.md` as base
- Generate tasks from Phase 1 design docs (data model, contracts, quickstart)
- RCON interface implementation task [P]
- Discord embed formatting task [P]
- Data persistence layer task [P]
- Death detection logic task
- Rate limiting implementation task
- Main bot integration and startup task

**Ordering Strategy**:

- Foundation first: Data models and storage layer
- Services next: RCON client and Discord message formatting
- Integration last: Death detection logic and main bot orchestration
- Mark [P] for parallel execution (independent modules)

**Estimated Output**: 8-12 numbered, ordered tasks in tasks.md focusing on core functionality

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
- [x] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:

- [x] Initial Constitution Check: PASS
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved
- [x] Complexity deviations documented (none required)

---

_Based on Constitution v2.1.1 - See `/memory/constitution.md`_
