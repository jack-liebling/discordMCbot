# Discord MC Bot

Discord bot application that monitors Minecraft server deaths via FTP log parsing and announces them in Discord channels. Features real-time death detection with accurate causes, comprehensive player statistics, and duplicate-safe restart behavior.

## Features

- **Real-time Death Detection**: Monitors Minecraft server logs via FTP for instant death notifications
- **Accurate Death Causes**: Parses actual death messages from server logs (e.g., "was slain by Spider", "drowned", "tried to swim in lava")
- **Player Statistics**: Tracks total deaths per player with persistent storage
- **Rate Limiting**: Prevents spam by ignoring deaths within 30 seconds of each other
- **Duplicate Prevention**: Tracks log position to prevent re-announcing old deaths on bot restart
- **Rich Discord Embeds**: Formatted announcements with timestamps, causes, and death counts

## Setup

1. Copy `.env.example` to `.env` and fill in your values:
   - Discord bot token
   - FTP credentials for your Minecraft server logs
   - Timezone settings
2. Run `npm install`
3. Run `npm run build`
4. Run `npm start`

## Development

- `npm run dev` - Run with ts-node for development
- `npm run build` - Compile TypeScript
- `npm run watch` - Watch for changes and recompile

## Configuration

See `.env.example` for required environment variables. The bot requires FTP access to your Minecraft server's `latest.log` file for death detection.
