# Discord MC Bot

Discord bot application that monitors Minecraft server activity via FTP log parsing, providing comprehensive death tracking, intelligent player session notifications, and daily leaderboards. Built for small friend groups with focus on clean channel management and reliable notifications.

## 🔥 Key Features

### 🎯 Smart Player Online Notifications

- **Clean Channel Management**: Automatically posts when players join the server and **deletes messages when they leave** - keeps your channel current and clutter-free
- **@Crafters Role Mentions**: Instantly notifies your gaming group when someone comes online
- **Anti-Spam Protection**: 2-minute cooldown prevents notification spam from rapid login/logout cycles
- **Intelligent Message Lifecycle**: JOIN messages are preserved if players reconnect quickly, deleted only after sustained offline periods

### 💀 Advanced Death Tracking

- **Real-time Death Detection**: Monitors Minecraft server logs via FTP for instant death notifications
- **Accurate Death Causes**: Parses actual death messages from server logs (e.g., "was slain by Spider", "drowned", "tried to swim in lava")
- **Player Statistics**: Tracks total deaths per player with persistent PostgreSQL storage
- **Rate Limiting**: Prevents spam by ignoring deaths within 30 seconds of each other
- **Duplicate Prevention**: Tracks log position to prevent re-announcing old deaths on bot restart

### 📊 Daily Leaderboards & Analytics

- **Automated Daily Leaderboards**: Death count rankings announced daily at 11:59 PM EST
- **Survival Champion Tracking**: Celebrates the longest-surviving active player
- **Activity-Based Filtering**: Only includes players active within the last 7 days
- **Rich Discord Embeds**: Beautiful formatted announcements with timestamps and statistics

## 🚀 What Makes This Special

### Channel Cleanliness

Unlike other notification bots that spam your channels, this bot maintains a **clean "who-is-on" channel** that only shows currently active players. Messages are automatically deleted when players go offline, ensuring your channel stays organized and current.

### Smart Cooldown System

The bot's intelligent 2-minute cooldown system prevents notification spam while preserving the user experience:

- **Rapid Reconnects**: If a player disconnects and reconnects quickly, existing notifications are preserved
- **Clean Departures**: Only sustained offline periods trigger message deletion
- **No Notification Spam**: Multiple quick logins don't create duplicate messages

### Enterprise-Grade Reliability

- **PostgreSQL Database**: Robust data persistence with Railway cloud deployment
- **JSON Fallback Storage**: Graceful degradation when database is unavailable
- **FTP Auto-Reconnection**: Resilient log monitoring that survives network interruptions
- **Restart-Safe Operations**: No duplicate announcements or lost state across bot restarts

## Setup

1. **Environment Configuration**: Copy `.env.example` to `.env` and configure:

   ```bash
   # Discord Bot
   DISCORD_BOT_TOKEN=your_discord_bot_token
   DISCORD_CHANNEL_ID=your_main_channel_id
   DISCORD_GUILD_ID=your_server_id

   # Session Notifications (NEW!)
   SESSION_NOTIFICATIONS_ENABLED=true
   CRAFTERS_ROLE_ID=your_crafters_role_id
   WHO_IS_ON_CHANNEL_ID=your_who_is_on_channel_id

   # FTP Server Access
   FTP_HOST=your_minecraft_server_ftp
   FTP_USERNAME=your_ftp_username
   FTP_PASSWORD=your_ftp_password

   # Database (PostgreSQL recommended)
   DATABASE_URL=postgresql://user:pass@host:port/db

   # Timezone & Scheduling
   TIMEZONE=America/New_York
   ```

2. **Installation & Running**:

   ```bash
   npm install
   npm run build
   npm start
   ```

3. **Development Mode**:
   ```bash
   npm run dev     # Run with ts-node for development
   npm run watch   # Watch for changes and recompile
   ```

## 🏗️ Architecture & Tech Stack

- **Language**: TypeScript with Node.js 18+
- **Discord**: discord.js v14 for bot framework and rich embed support
- **Log Monitoring**: FTP client for real-time Minecraft server log parsing
- **Database**: PostgreSQL (Railway cloud deployment) with JSON file fallback
- **Scheduling**: Built-in cron-like system for daily announcements
- **Config Management**: dotenv for secure environment variable handling

### Core Components

- **SessionNotificationService**: Manages player JOIN/LEAVE notifications with lifecycle tracking
- **LeaderboardService**: Daily death count rankings and survival champion detection
- **ActivityParser**: Advanced log parsing with coordinate extraction and metadata analysis
- **HybridStorage**: Database-first storage with automatic JSON fallback
- **FTP LogParser**: Real-time log monitoring with position tracking and duplicate prevention

## 🎮 Perfect for Small Gaming Groups

This bot is specifically designed for small friend groups who want:

- **Instant Awareness**: Know immediately when friends come online
- **Clean Channels**: No notification spam or outdated messages
- **Fun Competition**: Daily leaderboards and survival challenges
- **Reliable Operation**: Enterprise-grade reliability without the complexity
- **Zero Maintenance**: Set it up once and forget about it

## 📋 Discord Permissions Required

Your bot needs these permissions in your Discord server:

- **Send Messages** - Post death and session notifications
- **Manage Messages** - Delete session messages when players leave
- **Use External Emojis** - Rich embed formatting
- **Embed Links** - Formatted announcements
- **Mention Everyone** - @Crafters role mentions for session notifications

## 🔧 Advanced Configuration

The bot supports extensive customization through environment variables:

- **Notification Timing**: Adjust cooldown periods for your group's play style
- **Channel Targeting**: Separate channels for deaths vs. session notifications
- **Role Management**: Configure which roles get mentioned for online notifications
- **Timezone Handling**: Proper EST/EDT support for daily announcements
- **Storage Options**: PostgreSQL primary with JSON backup for reliability
