# GitHub Copilot Instructions

## Project Overview

Discord bot application that monitors Minecraft server deaths via FTP log parsing and announces them in Discord channels. Built for small friend groups with focus on simplicity and reliability.

## Tech Stack

- **Language**: TypeScript with Node.js 18+
- **Discord**: discord.js for bot framework and slash commands
- **Log Access**: FTP client for real-time Minecraft server log monitoring
- **Storage**: Remote PostgreSQL database via Railway deployment with JSON file fallback
- **Config**: dotenv for environment variable management

## Architecture Principles

- Single feature focus with planned leaderboard extension
- PostgreSQL database storage with Railway deployment and JSON file fallback
- Event-driven Discord bot architecture
- Graceful error handling without crashes
- 30-second rate limiting per player
- Log position tracking to prevent duplicate announcements
- Daily scheduled announcements at 11:59 PM EST

## Core Entities

- **DeathEvent**: Player death with timestamp, cause, experience level
- **Player**: Persistent death statistics, rate limiting data, and activity tracking
- **DailyLeaderboard**: Ranked player death counts with survival champion
- **SurvivalChampion**: Longest-surviving active player (within 7 days)
- **DiscordChannelConfig**: Channel settings for announcements
- **FtpConfig**: FTP server connection details for log access
- **LogProcessingState**: Tracks processed log positions across restarts
- **LeaderboardConfig**: Daily announcement scheduling and state

## Key Implementation Notes

- Use Discord embeds for structured death announcements
- FTP log parsing every 10 seconds for accurate death detection with real causes
- Rate limit: ignore deaths <5 seconds apart from same player (reduced from 30)
- Comprehensive death message parsing with regex patterns
- Environment variables for all secrets (tokens, passwords, FTP credentials, database connection)
- Auto-reconnection logic for FTP connections
- Database persistence prevents duplicate announcements on bot restart
- JSON file fallback system for when database is unavailable
- Comprehensive player activity tracking beyond deaths (join, leave, chat, achievements)
- Activity-specific rate limiting and database schema with player_activities table
- **Example log file**: `example_latest.log` contains sample Minecraft server logs for testing and context

## File Structure

```
src/
├── bot.ts          # Main bot entry point and Discord client
├── logParser.ts    # FTP log monitoring and death parsing
├── discord.ts      # Message formatting and embed creation
├── database.ts     # PostgreSQL database connection and operations
├── hybridStorage.ts # Storage abstraction with database/JSON fallback
├── playerTracker.ts # Player death statistics and rate limiting
├── announcer.ts    # Discord announcement service
├── leaderboardService.ts # Daily leaderboard generation and scheduling
├── leaderboardFormatter.ts # Discord embed formatting for leaderboards
├── schedulerService.ts # Daily timing coordination for announcements
├── logger.ts       # Centralized logging service
├── config.ts       # Environment configuration loader
└── types.ts        # TypeScript interfaces and types
```

## Recent Changes

- 2025-09-16: Initial project setup and specification
- 2025-09-16: Implementation planning with discord.js focus
- 2025-09-16: Data model and contract definitions complete
- 2025-09-17: Migrated from RCON polling to FTP log parsing for accurate death detection
- 2025-09-17: Added comprehensive death message parsing with real causes
- 2025-09-17: Implemented log position tracking to prevent duplicate announcements
- 2025-09-17: Enhanced timezone handling and rate limiting accuracy
- 2025-09-17: Removed RCON dependency entirely - now FTP-only architecture
- 2025-09-17: Migrated from JSON file storage to remote PostgreSQL database via Railway
- 2025-09-17: Planned daily death leaderboard feature with survival champion tracking

## Constitutional Requirements

- Keep implementation simple and focused
- No testing framework (just make it work)
- Friend-focused design with intuitive operation
- Graceful error handling and safety measures
- Minimal dependencies and straightforward code

## Development Priorities

1. ✅ FTP log parsing and death detection with accurate causes
2. ✅ Discord bot setup and embed messaging
3. ✅ Data persistence and rate limiting
4. ✅ Error handling and reconnection logic
5. ✅ Log position tracking and duplicate prevention
6. ✅ RCON removal - simplified FTP-only architecture
7. ✅ Migrated from JSON file storage to remote PostgreSQL database via Railway
8. 🔄 Daily death leaderboard with survival champion tracking
9. 🔄 Enhanced player activity tracking (join, leave, chat, achievements, deaths)
