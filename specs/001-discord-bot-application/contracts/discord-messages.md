# Discord Bot Events Contract

## Death Announcement Message Schema

### Discord Embed Format

```typescript
interface DeathAnnouncementEmbed {
  title: string; // "💀 Player Death Alert"
  description: string; // "{username} {cause}"
  color: number; // Red color (0xFF0000)
  fields: [
    {
      name: "Time of Death";
      value: string; // ISO timestamp formatted for display
      inline: true;
    },
    {
      name: "Experience Level";
      value: string; // "Level {number}" or "Unknown"
      inline: true;
    },
    {
      name: "Total Deaths";
      value: string; // "Death #{number}"
      inline: true;
    }
  ];
  footer: {
    text: string; // "Friends MC Server"
  };
  timestamp: string; // ISO timestamp
}
```

### Example Message

```json
{
  "embeds": [
    {
      "title": "💀 Player Death Alert",
      "description": "Steve was slain by Zombie",
      "color": 16711680,
      "fields": [
        {
          "name": "Time of Death",
          "value": "Sep 16, 2025 at 10:25 AM",
          "inline": true
        },
        {
          "name": "Experience Level",
          "value": "Level 42",
          "inline": true
        },
        {
          "name": "Total Deaths",
          "value": "Death #15",
          "inline": true
        }
      ],
      "footer": {
        "text": "Friends MC Server"
      },
      "timestamp": "2025-09-16T10:25:30.000Z"
    }
  ]
}
```

## Error Message Schema

### Connection Error

```typescript
interface ConnectionErrorEmbed {
  title: string; // "⚠️ Connection Issue"
  description: string; // Error description
  color: number; // Yellow color (0xFFFF00)
  footer: {
    text: string; // "Bot will retry automatically"
  };
}
```

### Rate Limited Message

```typescript
interface RateLimitNotice {
  content: string; // "⏱️ {username} died again too quickly - announcement skipped"
}
```
