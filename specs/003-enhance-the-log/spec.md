# Feature Specification: Enhanced Player Activity Tracking

**Feature Branch**: `003-enhance-the-log`  
**Created**: September 17, 2025  
**Status**: Draft  
**Input**: User description: "enhance the log parser to account for all player activity, not just deaths. I want players to be logged in the database and accurately tracked for other things other than just deaths"

## Execution Flow (main)

```
1. Parse user description from Input
   → User wants comprehensive player activity tracking beyond deaths
2. Extract key concepts from description
   → Actors: Players, Discord bot system
   → Actions: Join/leave server, chat messages, achievements, item interactions, deaths
   → Data: Player activity logs, session tracking, comprehensive statistics
   → Constraints: Real-time monitoring, database persistence
3. For each unclear aspect:
   → All clarifications provided by user
4. Fill User Scenarios & Testing section
   → Clear user flow for comprehensive activity tracking
5. Generate Functional Requirements
   → Each requirement testable for specific log patterns
6. Identify Key Entities
   → Enhanced entities for comprehensive activity data
7. Run Review Checklist
   → All uncertainties resolved with user clarifications
8. Return: SUCCESS (spec ready for planning)
```

---

## ⚡ Quick Guidelines

- ✅ Focus on WHAT users need and WHY
- ❌ Avoid HOW to implement (no tech stack, APIs, code structure)
- 👥 Written for business stakeholders, not developers

---

## User Scenarios & Testing

### Primary User Story

As a Minecraft server operator, I want to track all player activities (not just deaths) so that I can understand player engagement, create comprehensive statistics, and potentially build features like activity leaderboards, playtime tracking, and player behavior analytics.

### Acceptance Scenarios

1. **Given** a player joins the Minecraft server, **When** the log parser processes the join event (e.g., "MaroonFranc joined the game"), **Then** the system records the player's session start time, UUID, and login location
2. **Given** a player sends a chat message, **When** the log parser detects the message (e.g., "<MaroonFranc> hiiiiiiiiiiiiiiiii"), **Then** the system logs the chat activity timestamp and player identifier without storing message content
3. **Given** a player completes an achievement, **When** the achievement is logged (e.g., "MaroonFranc has made the advancement [Acquire Hardware]"), **Then** the system records the achievement type and timestamp for the player
4. **Given** a player dies, **When** the death event occurs (e.g., "JackL64 drowned"), **Then** the system records the death cause and timestamp (existing functionality enhanced)
5. **Given** a player leaves the server, **When** the disconnect is detected (e.g., "JackL64 left the game"), **Then** the system calculates session duration and updates playtime statistics
6. **Given** multiple activity types occur simultaneously, **When** the log parser processes events, **Then** all activities are captured and stored without data loss

### Edge Cases

- What happens when a player reconnects quickly (within rate limiting window)?
- How does the system handle corrupted or incomplete log entries?
- What occurs if a player's activity spans multiple log files or server restarts?
- How are activities handled during server crashes with incomplete session data?
- What happens when log entries contain unexpected formats or new event types?

## Requirements

### Functional Requirements

- **FR-001**: System MUST detect and parse all player join/leave events from Minecraft server logs
- **FR-002**: System MUST track player chat activity timestamps (e.g., "<PlayerName> message") without storing message content
- **FR-003**: System MUST capture player achievement unlocks and advancement completions (e.g., "PlayerName has made the advancement [Name]")
- **FR-004**: System MUST record player death events with enhanced detail (existing functionality)
- **FR-005**: System MUST calculate and store session durations for each player login period
- **FR-006**: System MUST maintain cumulative playtime statistics per player
- **FR-007**: System MUST detect and log player achievement unlocks (e.g., "has made the advancement [Acquire Hardware]")
- **FR-008**: System MUST persist all activity data to database for historical analysis
- **FR-009**: System MUST apply rate limiting to prevent spam from repetitive activities
- **FR-010**: System MUST maintain activity tracking across bot restarts without data loss
- **FR-011**: System MUST provide database storage for all tracked activities (no real-time Discord notifications required)
- **FR-012**: System MUST track player UUID associations for consistent identification across sessions

### Key Entities

- **PlayerActivity**: Represents individual activity events with timestamp, player identifier, activity type (join, leave, chat, achievement, death), and relevant metadata (coordinates, achievement name, death cause)
- **ActivitySession**: Tracks continuous play periods with start/end times, duration, total chat messages, achievements earned, and deaths during session
- **ActivityType**: Categorizes different types of trackable events (JOIN, LEAVE, CHAT, ACHIEVEMENT, DEATH) with specific parsing patterns
- **Player**: Enhanced existing entity to include comprehensive activity statistics, UUID mapping, session history, and engagement patterns
- **ActivityStatistics**: Aggregated metrics per player including total playtime, activity counts by type, session frequency, and achievement progress

### Log Pattern Examples _(from example latest.log)_

Based on the provided log file, the system must parse these specific patterns:

**Player Authentication & Join:**

- `UUID of player MaroonFranc is cf438c33-ce0b-40ff-a552-859ccbc7338e`
- `MaroonFranc joined the game`
- `MaroonFranc[/72.88.209.7:52461] logged in with entity id 57 at ([Ironman]-469.23, 21.06, 1134.51)`

**Chat Messages:**

- `<MaroonFranc> hiiiiiiiiiiiiiiiii`
- `<JackL64> byeeeeeeee`

**Achievements:**

- `MaroonFranc has made the advancement [Acquire Hardware]`
- `MaroonFranc has made the advancement [Suit Up]`

**Deaths:**

- `JackL64 drowned`
- `JackL64 fell from a high place`

**Player Disconnect:**

- `MaroonFranc lost connection: Disconnected`
- `MaroonFranc left the game`

---

## Review & Acceptance Checklist

### Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

### Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

---

## Execution Status

- [x] User description parsed
- [x] Key concepts extracted
- [x] Ambiguities marked
- [x] User scenarios defined
- [x] Requirements generated
- [x] Entities identified
- [x] Review checklist passed

---
