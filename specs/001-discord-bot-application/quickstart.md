# Quickstart: Minecraft Death Announcements Discord Bot

## Prerequisites

- Node.js 18+ installed
- Discord Bot Token with "Send Messages" and "Use Slash Commands" permissions
- Minecraft server with RCON enabled
- RCON password for the Minecraft server

## Setup Steps

### 1. Environment Configuration

Create `.env` file in project root:

```env
DISCORD_TOKEN=your_discord_bot_token_here
DISCORD_CHANNEL_ID=your_discord_channel_id_here
DISCORD_GUILD_ID=your_discord_server_id_here

RCON_HOST=your_minecraft_server_ip
RCON_PORT=25575
RCON_PASSWORD=your_rcon_password
SERVER_NAME=Friends MC Server
POLL_INTERVAL=5
```

### 2. Install Dependencies

```bash
npm install discord.ts minecraft-rcon dotenv
npm install --save-dev @types/node typescript ts-node
```

### 3. Basic Configuration

The bot will auto-create `config.json` and `players.json` on first run with default settings.

### 4. Start the Bot

```bash
npm run start
# or for development:
npm run dev
```

## Quick Validation Test

### Test Death Announcement

1. **Start the bot**: `npm run start`
2. **Join Minecraft server**: Connect with a test account
3. **Die in game**: Jump off a cliff, get killed by mob, etc.
4. **Check Discord**: Bot should post death announcement within 5-10 seconds

### Expected Discord Message

```
💀 Player Death Alert
{YourUsername} fell from a high place

Time of Death: Sep 16, 2025 at 10:25 AM
Experience Level: Level 15
Total Deaths: Death #1

Friends MC Server
```

### Test Rate Limiting

1. **Die quickly twice**: Die within 30 seconds of previous death
2. **Check Discord**: Second death should NOT create announcement
3. **Wait 30+ seconds**: Die again, should create new announcement

## Troubleshooting

### Bot Not Connecting to Discord

- Verify `DISCORD_TOKEN` is correct
- Check bot has permissions in target channel
- Confirm `DISCORD_CHANNEL_ID` and `DISCORD_GUILD_ID` are correct

### RCON Connection Issues

- Verify Minecraft server has RCON enabled in `server.properties`
- Check `rcon.port=25575` and `enable-rcon=true` in server config
- Confirm firewall allows RCON port access
- Test RCON connection manually with tools like `mcrcon`

### Deaths Not Detected

- Check bot console for RCON errors
- Verify player usernames match exactly (case sensitive)
- Confirm server is responding to `list` command
- Check if player died in undetectable way (logout during fall, etc.)

### Discord Messages Not Sending

- Verify bot permissions: "Send Messages", "Use Embeds"
- Check Discord API rate limits in console
- Confirm channel exists and bot has access

## File Structure After Setup

```
project/
├── .env                 # Environment variables (keep secret!)
├── package.json         # Node.js dependencies
├── config.json          # Bot configuration (auto-created)
├── players.json         # Player death statistics (auto-created)
├── src/
│   ├── bot.ts          # Main bot entry point
│   ├── rcon.ts         # RCON connection handler
│   ├── discord.ts      # Discord message formatting
│   └── storage.ts      # Data persistence layer
└── logs/               # Error and debug logs (auto-created)
```

## Basic Usage Commands

The bot operates automatically - no manual commands needed. It:

- Monitors Minecraft server continuously
- Announces deaths in configured Discord channel
- Tracks death counts persistently
- Handles reconnections automatically

## Next Steps

- Customize death message formats in `src/discord.ts`
- Adjust polling interval in `.env` for different responsiveness
- Add additional channels or servers by modifying configuration
- Monitor logs for performance and error tracking
