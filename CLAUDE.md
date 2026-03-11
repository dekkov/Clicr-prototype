# CLICR V4 — Claude Rules

## Git
- Never commit or push changes unless the user explicitly asks.
- When changes are ready, summarize what would be committed and wait for instruction.

## Documentation
- Always use the context7 MCP (`mcp__context7__resolve-library-id` + `mcp__context7__query-docs`) for up-to-date library documentation and code examples before implementing features with any third-party library.
