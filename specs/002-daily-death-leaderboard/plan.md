# Implementation Plan: Daily Death Leaderboard

**Branch**: `002-daily-death-leaderboard` | **Date**: September 17, 2025 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-daily-death-leaderboard/spec.md`

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

Daily death leaderboard system that automatically posts ranked player death statistics at 11:59 PM EST. Includes total death counts for all tracked players and highlights the current survival champion (longest time alive among players active within the past week). Uses existing FTP log parsing infrastructure with scheduled announcement delivery via Discord embeds.

## Technical Context

**Language/Version**: TypeScript 5.9.2 with Node.js (target ES2022)
**Primary Dependencies**: discord.js 14.22.1, ftp 0.3.10, dotenv 17.2.2
**Storage**: JSON file-based persistence (players.json, config.json)
**Testing**: No formal testing framework (constitution: "just make it work")
**Target Platform**: Node.js server environment
**Project Type**: single - Discord bot application
**Performance Goals**: Daily batch processing at 11:59 PM EST (low frequency)
**Constraints**: 30-second rate limiting per player (existing), EST timezone handling
**Scale/Scope**: Small friend group usage (~10-20 players maximum)

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

**✅ Single Feature Focus**: Daily leaderboard is a single, well-defined feature extension
**✅ Friend-Focused Design**: Leaderboard provides friendly competition and recognition among the group
**✅ Just Make It Work**: Using existing infrastructure (FTP parsing, Discord embeds) for quick implementation
**✅ Safety and Moderation**: Leverages existing rate limiting and error handling patterns
**✅ Keep It Simple**: Minimal addition to existing codebase, reuses established patterns

**Constitution Compliance**: PASS - Feature aligns with all constitutional principles

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

- Load contracts from `/contracts/` directory (3 service contracts created)
- Generate tasks from data model extensions (Player interface, ConfigData interface)
- Each contract generates implementation + test tasks
- Follow TDD approach: contract tests first, then implementation
- Use existing patterns from current codebase (storage, discord, logger services)

**Ordering Strategy**:

- **Phase 2a**: Data model extensions (Player.lastSeenTimestamp, LeaderboardConfig)
- **Phase 2b**: Core services (LeaderboardService, SchedulerService, LeaderboardFormatter)
- **Phase 2c**: Integration (wire services into existing bot architecture)
- **Phase 2d**: Scheduling activation (start daily timer in bot initialization)
- Dependencies: Models → Services → Integration → Activation

**Estimated Output**: 15-20 numbered, ordered tasks covering:

1. Type definitions and interface extensions (2-3 tasks)
2. Storage service modifications (2 tasks)
3. LeaderboardService implementation (3-4 tasks)
4. SchedulerService implementation (2-3 tasks)
5. LeaderboardFormatter implementation (2 tasks)
6. Bot integration and wiring (2-3 tasks)
7. Configuration initialization (1 task)
8. Testing and validation (2-3 tasks)

**Parallel Execution Opportunities**:

- LeaderboardService and SchedulerService can be developed in parallel [P]
- LeaderboardFormatter can be developed independently [P]
- Type definitions can be completed before service implementation

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
- [ ] Complexity deviations documented

---

_Based on Constitution v2.1.1 - See `/memory/constitution.md`_
