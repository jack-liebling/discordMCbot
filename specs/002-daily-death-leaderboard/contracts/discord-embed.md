# Discord Embed Contract

**Service**: Discord Leaderboard Formatter  
**Purpose**: Format leaderboard data into Discord embed messages  
**Dependencies**: discord.js EmbedBuilder

## Interface Definition

```typescript
export interface LeaderboardFormatter {
  /**
   * Create Discord embed for daily leaderboard
   * @param leaderboard DailyLeaderboard Generated leaderboard data
   * @returns EmbedBuilder Formatted Discord embed
   */
  createLeaderboardEmbed(leaderboard: DailyLeaderboard): EmbedBuilder;

  /**
   * Format survival time duration into human-readable string
   * @param timeAliveMs number Milliseconds alive
   * @returns string Formatted duration (e.g., "3 days, 5 hours")
   */
  formatSurvivalTime(timeAliveMs: number): string;

  /**
   * Create embed for when no deaths are recorded
   * @returns EmbedBuilder Empty leaderboard embed
   */
  createEmptyLeaderboardEmbed(): EmbedBuilder;
}
```

## Embed Design Specification

### Standard Leaderboard Embed

```typescript
{
  title: "🏆 Daily Death Leaderboard",
  description: "Death counts for all tracked players",
  color: 0x8B4513, // Saddle brown color for death theme
  timestamp: new Date().toISOString(),
  footer: {
    text: `Generated for ${totalPlayers} players • Updated daily at 11:59 PM EST`
  },
  fields: [
    {
      name: "📊 Rankings",
      value: leaderboardText,
      inline: false
    },
    {
      name: "🛡️ Survival Champion",
      value: survivalChampionText,
      inline: false
    }
  ]
}
```

### Empty Leaderboard Embed

```typescript
{
  title: "🏆 Daily Death Leaderboard",
  description: "No deaths recorded yet - everyone is surviving! 🎉",
  color: 0x90EE90, // Light green for no deaths
  timestamp: new Date().toISOString(),
  footer: {
    text: "Updated daily at 11:59 PM EST"
  }
}
```

## Input Contracts

### createLeaderboardEmbed(leaderboard)

**Input Validation**:

```typescript
interface DailyLeaderboard {
  generatedAt: Date; // Must be valid Date
  totalPlayers: number; // Must be >= 0
  leaderboard: LeaderboardEntry[]; // Must be sorted array
  survivalChampion: SurvivalChampion | null; // Optional champion
}
```

**Preconditions**:

- leaderboard.leaderboard array must be sorted by rank
- Each LeaderboardEntry must have valid rank, username, totalDeaths
- survivalChampion must be null or valid SurvivalChampion object

### formatSurvivalTime(timeAliveMs)

**Input Validation**:

```typescript
// timeAliveMs: number
// Must be >= 0
// Represents milliseconds since last death
```

**Processing Rules**:

- Convert milliseconds to days, hours, minutes
- Format as human-readable string
- Handle edge cases (0 time, very large times)

## Output Contracts

### Leaderboard Field Format

```
📊 Rankings
1. Steve - 12 deaths 💀
2. Alex - 8 deaths 🔥
3. Notch - 5 deaths ⚡
4. Herobrine - 3 deaths 🕷️
5. BuilderBob - 1 death 🌊
   (inactive: CasualPlayer - 15 deaths)
```

**Format Rules**:

- Rank number followed by period
- Username with no special characters
- Death count with "death" or "deaths"
- Emoji based on death count:
  - 1-2 deaths: 🌊 (water/drowning)
  - 3-5 deaths: 🕷️ (spider/monster)
  - 6-10 deaths: ⚡ (lightning/explosion)
  - 11-20 deaths: 🔥 (fire/lava)
  - 21+ deaths: 💀 (skull/excessive)
- Inactive players shown at bottom with "(inactive: ...)" prefix

### Survival Champion Field Format

```
🛡️ Survival Champion
🥇 Steve has survived for **3 days, 14 hours**
Last death: September 14th, 2025 at 2:30 PM EST
```

**Format Rules**:

- Champion emoji (🥇) followed by username
- Survival time in bold formatting
- Last death timestamp in human-readable format
- If no last death: "Last death: Never (perfect record!)"

### formatSurvivalTime() Output Examples

```
Input: 86400000 (1 day)     → Output: "1 day"
Input: 90000000 (25 hours)  → Output: "1 day, 1 hour"
Input: 7260000 (2h 1m)      → Output: "2 hours, 1 minute"
Input: 3600000 (1 hour)     → Output: "1 hour"
Input: 300000 (5 minutes)   → Output: "5 minutes"
Input: 30000 (30 seconds)   → Output: "less than 1 minute"
Input: 0                    → Output: "just died"
```

## Discord Limits & Constraints

### Embed Limits

- **Title**: Max 256 characters
- **Description**: Max 4096 characters
- **Field name**: Max 256 characters
- **Field value**: Max 1024 characters
- **Footer text**: Max 2048 characters
- **Total fields**: Max 25 fields

### Estimated Content Size

- **Title**: ~25 characters
- **Description**: ~35 characters
- **Rankings field**: ~50 characters per player (20 players = 1000 chars)
- **Survival champion**: ~150 characters
- **Footer**: ~60 characters
- **Total**: ~1270 characters for 20 players (well within limits)

## Error Handling

### Exception Cases

```typescript
// EmbedFormattingError: When embed creation fails
class EmbedFormattingError extends Error {
  constructor(message: string, data?: any) {
    super(`Embed formatting failed: ${message}`);
    this.data = data;
  }
}

// ContentTooLongError: When content exceeds Discord limits
class ContentTooLongError extends EmbedFormattingError {
  constructor(field: string, length: number, limit: number) {
    super(`${field} exceeds Discord limit: ${length}/${limit} characters`);
  }
}
```

### Error Recovery

- **Content too long**: Truncate player list with "...and X more players"
- **Invalid timestamps**: Use current time as fallback
- **Missing data**: Use placeholder text ("Unknown", "N/A")
- **Emoji issues**: Fall back to plain text

## Visual Design Guidelines

### Color Scheme

- **Standard leaderboard**: 0x8B4513 (Saddle brown - death theme)
- **Empty leaderboard**: 0x90EE90 (Light green - survival theme)
- **Error state**: 0xFF0000 (Red - error indication)

### Emoji Usage

- **Title**: 🏆 (trophy for leaderboard)
- **Rankings section**: 📊 (chart for statistics)
- **Survival champion**: 🛡️ (shield for protection)
- **Champion indicator**: 🥇 (gold medal)
- **Death count emojis**: Context-based (water, fire, skull, etc.)

### Text Formatting

- **Player names**: Plain text
- **Death counts**: Plain text with emoji
- **Survival time**: Bold (**time**)
- **Inactive indicator**: Parentheses with prefix
- **Timestamps**: Plain text with EST timezone

## Testing Contracts

### Unit Test Requirements

```typescript
describe("LeaderboardFormatter", () => {
  describe("createLeaderboardEmbed", () => {
    it("should create valid embed with proper fields");
    it("should handle empty leaderboard gracefully");
    it("should format survival champion correctly");
    it("should mark inactive players appropriately");
    it("should respect Discord character limits");
  });

  describe("formatSurvivalTime", () => {
    it("should format days, hours, minutes correctly");
    it("should handle edge cases (0, very large numbers)");
    it("should use proper singular/plural forms");
  });
});
```

### Integration Test Requirements

- Verify embed renders correctly in Discord
- Test with maximum player count (character limit testing)
- Validate emoji rendering across different Discord clients
- Confirm timestamp formatting displays correctly in EST
