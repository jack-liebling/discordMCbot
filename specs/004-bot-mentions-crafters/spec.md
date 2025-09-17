# Feature Specification: Player Online Notifications with Crafters Role Mentions

**Feature Branch**: `004-bot-mentions-crafters`  
**Created**: September 17, 2025  
**Status**: Draft  
**Input**: User description: "I want the bot to @ the 'Crafters' role in a seperate channel when a player has logged on, letting other users know that someone is on the minecraft server. I want the bot to delete their message when that player logs off. I want the bot to account for players logging on and off in rapid succession. It shouldn't post a new log on message unless the user has been offline for at least 2 minutes. It also shouldn't delete the message unless that user has been offline for at least 2 minutes."

## Execution Flow (main)

```
1. Parse user description from Input
   → ✅ Feature description provided and clear
2. Extract key concepts from description
   → Actors: Discord bot, Minecraft players, Crafters role members
   → Actions: @mention on login, message deletion on logout, cooldown protection
   → Data: Player online status, message tracking, timestamps
   → Constraints: 2-minute minimum offline time before actions
3. For each unclear aspect:
   → [NEEDS CLARIFICATION: Which Discord channel should be used for notifications?]
   → [NEEDS CLARIFICATION: Should the bot handle multiple players online simultaneously?]
4. Fill User Scenarios & Testing section
   → ✅ Clear user flow for login/logout notifications
5. Generate Functional Requirements
   → ✅ Each requirement is testable
6. Identify Key Entities
   → ✅ Player sessions, notification messages, timestamps
7. Run Review Checklist
   → ✅ No uncertainties remain - all clarifications resolved
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

As a member of the Crafters Discord role, I want to be automatically notified when players join the Minecraft server so that I know when someone is online and can decide whether to join them for multiplayer activities. I also want these notifications to be cleaned up when players leave to keep the channel organized and current.

### Acceptance Scenarios

1. **Given** a player has been offline for at least 2 minutes, **When** they log into the Minecraft server, **Then** the bot posts a message mentioning @Crafters role announcing the player is online
2. **Given** a player is online and has an active notification message, **When** they log off and remain offline for at least 2 minutes, **Then** the bot deletes the original notification message
3. **Given** a player logs off and logs back on within 2 minutes, **When** this rapid succession occurs, **Then** the bot takes no action (no new message posted, existing message not deleted)
4. **Given** multiple players are online simultaneously, **When** each player's status changes, **Then** the bot manages each player's notification message independently
5. **Given** a player logs on for the first time, **When** they join the server, **Then** the bot creates a new notification message (assuming 2-minute rule doesn't apply to first-time joins)

### Edge Cases

- What happens when the bot restarts while players are online and messages exist?
- How does the system handle Discord API failures when posting or deleting messages?
- What occurs if the Crafters role is deleted or renamed?
- How does the bot behave if it loses access to the "who-is-on" channel?
- What happens if a player's username changes while they're online?

## Requirements

### Functional Requirements

- **FR-001**: System MUST monitor Minecraft server login events in real-time
- **FR-002**: System MUST monitor Minecraft server logout events in real-time
- **FR-003**: System MUST track each player's online/offline status with timestamps
- **FR-004**: System MUST enforce a 2-minute minimum offline period before posting login notifications
- **FR-005**: System MUST enforce a 2-minute minimum offline period before deleting logout notifications
- **FR-006**: System MUST post Discord messages mentioning @Crafters role when players log in (after cooldown)
- **FR-007**: System MUST delete the corresponding notification message when players log out (after cooldown)
- **FR-008**: System MUST handle multiple players being online simultaneously with independent message tracking
- **FR-009**: System MUST persist notification message tracking across bot restarts
- **FR-010**: System MUST ignore rapid login/logout cycles within the 2-minute window
- **FR-011**: System MUST post notifications to the "who-is-on" Discord channel
- **FR-012**: System MUST gracefully handle cases where the @Crafters role doesn't exist by posting notifications without the role mention and logging a warning

### Key Entities

- **Player Session**: Represents a player's current online status, including username, login timestamp, logout timestamp, and current notification message ID
- **Notification Message**: Discord message posted for a player login, tracked by message ID and associated player username
- **Cooldown Timer**: Tracks the 2-minute window for each player to prevent rapid succession actions
- **Channel Configuration**: Configuration for the "who-is-on" Discord channel where player notifications are posted

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
