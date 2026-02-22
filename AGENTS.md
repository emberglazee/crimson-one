# AGENTS.md - Guidelines for AI Coding Agents

This document provides guidelines for AI agents working on the Crimson-One Discord bot codebase.

## Project Overview

A Discord bot built with TypeScript and Bun runtime, featuring AI chat, moderation, webhooks, and a Rust-based Markov chain module.

## Build/Run Commands

```bash
# Start the bot
bun src/guardian.ts

# Linting
npm run lint              # Check for linting errors
npm run lint:fix          # Fix linting errors automatically

# Rust subproject (crimson_markov/)
cd crimson_markov && cargo check
cd crimson_markov && cargo build --release

# Dashboard (React/ink-based CLI UI)
npm run dashboard:install
npm run dashboard
```

## Code Style Guidelines

### TypeScript/JavaScript

- **Runtime:** Bun (ES modules, `"type": "module"`)
- **Semicolons:** **NEVER** use semicolons (`semi: false`)
- **Quotes:** Single quotes with `avoidEscape: true`
- **Indentation:** 4 spaces (tabWidth: 4)
- **Trailing commas:** **NEVER** use trailing commas
- **Arrow functions:** Parens as-needed (`x => x` not `(x) => x`)
- **Function spacing:**
    - Anonymous: `function ()` (space before paren)
    - Named: `function name()` (no space)
    - Async arrow: `async () =>` (space before paren)
- **Member Delimiters:**
    - Multiline interfaces: No delimiter
    - Singleline interfaces: Comma delimiter

### TypeScript Types

- **Strict Mode:** Enabled (`strict: true`)
- **Imports:** Use `verbatimModuleSyntax: true` (import type separately or use `import type`)
- **Decorators:** Experimental decorators enabled (for TypeORM)
- **Naming:** PascalCase for Interfaces and Types

### Naming Conventions

- **Classes:** PascalCase (e.g., `CommandManager`, `CrimsonChat`)
- **Interfaces/Types:** PascalCase with descriptive names
- **Functions/Methods:** camelCase
- **Variables:** camelCase
- **Constants:** UPPER_SNAKE_CASE for true constants
- **Private members:** Prefix with underscore (e.g., `_log()`) - optional but common
- **Files:** camelCase (e.g., `commandHandler.ts`) or PascalCase matching the main export

### Imports

Sort imports by group:

1.  **External/Runtime:** `bun`, `tsyringe`, `discord.js`, etc.
2.  **Internal:** Local modules, utils (`./modules`, `../util`)
3.  **Side-effects:** `import 'reflect-metadata'` (usually at the top if critical, or bottom if just for effect)

```typescript
// External
import { container } from 'tsyringe'
import { spawn } from 'bun'

// Internal
import { Logger } from './modules'
import type { LogLevel } from '../types'

// Side-effects
import 'reflect-metadata'
```

### Error Handling

- **Graceful Shutdown:** Use the `GracefulShutdown` handler for uncaught errors.
- **Logging:** Always use the `Logger` class, not `console.log`.
- **Async:** Use `try/catch` for async operations.
- **Flow:** Prefer early returns over nested conditionals.

### Dependency Injection

- **Library:** `tsyringe`
- **Registration:** Register services in the global container before resolution.
- **Resolution:** Use `resolveServices()` for bulk resolution where applicable.

### Discord.js Patterns

- **Commands:** Use `SlashCommandBuilder` with `.satisfies SlashCommand`.
- **Events:** Located in `src/events/`, exporting a default function.
- **Context:** Use `InteractionContextType` for command contexts.

## File Organization

```
src/
├── commands/        # Discord slash commands
├── events/          # Discord event handlers
├── modules/         # Core business logic classes
├── types/           # TypeScript type definitions
├── util/            # Utility functions and helpers
├── migrations/      # Database migrations
├── guardian.ts      # Entry point wrapper (auto-restart/update)
├── index.ts         # Main bot initialization
└── init.ts          # First-time setup
```

## Important Notes

- **Bun Runtime:** Do not use Node.js-specific APIs that are incompatible with Bun.
- **Database:** Uses TypeORM with SQLite/PostgreSQL.
- **AI Integration:** Uses `@ai-sdk/openai-compatible`.
- **Rust Integration:** The `crimson_markov` crate is compiled separately and potentially called via FFI or subprocess.
