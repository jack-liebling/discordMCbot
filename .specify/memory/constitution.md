# Discord MC Bot Constitution

## Core Principles

### I. Single Feature Focus

Start with one core feature and get it working well. Since this is for a small group of friends, focus on making that one feature reliable and useful before considering any additions.

### II. Friend-Focused Design

The feature should enhance the friend group experience. Commands and functionality should be intuitive for casual users, not requiring technical knowledge or complex syntax.

### III. Just Make It Work

Priority is on getting the feature functional, not perfect. Quick iteration and direct feedback from friends is more valuable than extensive planning.

### IV. Safety and Moderation

Even among friends, include basic safety measures. Implement rate limiting, permission checks, and graceful error handling to prevent accidental spam or misuse.

### V. Keep It Simple

Code should be straightforward and readable since this is a side project. Use clear naming conventions and comment only when necessary for understanding.

## Development Guidelines

### Code Organization

- Keep the single feature implementation clean and contained
- Use environment variables for sensitive data (bot tokens, API keys)
- Write the minimum viable code to get the feature working

### Error Handling

- Provide basic error messages when things go wrong
- Don't crash the bot - handle errors gracefully
- Add simple timeouts for potentially long-running operations

### Command Design

- Use an intuitive command name that friends will remember
- Provide a helpful error message when the command is used incorrectly
- Keep response times reasonable when possible

## Security and Privacy

### Data Handling

- Minimize data collection - only store what's necessary for functionality
- Don't log sensitive information (passwords, personal details)
- Respect Discord's rate limits and API guidelines
- Use appropriate permissions - request only what the bot needs

### Access Control

- Implement basic role-based permissions for administrative commands
- Allow server admins to disable specific commands if needed
- Provide a way to restrict bot usage to specific channels if desired

## Governance

This constitution guides development decisions for the Discord bot. Since this is a simple project with one feature, keep things straightforward.

- Focus on making the feature work for the friend group
- Get feedback directly from friends and iterate quickly
- Don't overthink it - ship when it works

**Version**: 1.2.0 | **Ratified**: September 16, 2025 | **Last Amended**: September 17, 2025

## Implementation Notes

This constitution has guided the development of a Discord bot that monitors Minecraft deaths through FTP log parsing rather than RCON polling. The choice prioritizes accuracy (real death causes from logs) over simplicity while maintaining the core principle of "just make it work" for friend group usage.
