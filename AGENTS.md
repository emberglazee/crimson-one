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

**Note:** No test framework is currently configured. Tests should be run manually or added via a test framework like `bun:test`.

## Code Style Guidelines

### TypeScript/JavaScript

- **Runtime:** Bun (ES modules, `"type": "module"`)
- **Semicolons:** Never use semicolons
- **Quotes:** Single quotes with `avoidEscape: true`
- **Indentation:** 4 spaces (tabWidth: 4)
- **Trailing commas:** Never use trailing commas
- **Arrow functions:** Parens as-needed (`x => x` not `(x) => x`)
- **Function spacing:**
    - Anonymous: `function ()`
    - Named: `function name()`
    - Async arrow: `async () =>`

### TypeScript Types

- Enable `strict: true` in tsconfig
- Use `verbatimModuleSyntax: true` (import type separately)
- Prefer `type` imports for types
- Experimental decorators enabled for TypeORM
- Interface/type naming: PascalCase

### Naming Conventions

- **Classes:** PascalCase (e.g., `CommandManager`, `CrimsonChat`)
- **Interfaces/Types:** PascalCase with descriptive names
- **Functions/Methods:** camelCase
- **Variables:** camelCase
- **Constants:** UPPER_SNAKE_CASE for true constants
- **Private members:** Prefix with underscore (e.g., `_log()`)
- **Files:** camelCase or PascalCase matching the main export

### Imports

```typescript
// External imports first
import { container } from 'tsyringe'
import { EventEmitter } from 'tseep'

// Internal imports
import { Logger } from './modules'
import { blue, red } from '../util/colors'
import type { LogLevel } from '../types'

// Side-effect imports
import 'reflect-metadata'
```

### Error Handling

- Use graceful shutdown handler (`GracefulShutdown`) for uncaught errors
- Log errors using the `Logger` class
- Prefer early returns over nested conditionals
- Use `try/catch` for async operations that may fail

### Dependency Injection

- Use `tsyringe` for DI
- Register services in `container` before resolution
- Use `resolveServices()` utility for bulk resolution

### Discord.js Patterns

- Commands use `SlashCommandBuilder` with `.satisfies SlashCommand`
- Events are in `src/events/` and export a default function
- Use `InteractionContextType` for command contexts

## File Organization

```
src/
├── commands/        # Discord slash commands
├── events/          # Discord event handlers
├── modules/         # Core business logic classes
├── types/           # TypeScript type definitions
├── util/            # Utility functions and helpers
├── migrations/      # Database migrations
├── guardian.ts      # Entry point wrapper
├── index.ts         # Main initialization
└── init.ts          # First-time setup
```

## Important Notes

- This bot uses **Bun runtime** - do not use Node.js-specific APIs without checking Bun compatibility
- Database: SQLite/PostgreSQL via TypeORM
- External AI integration via `@ai-sdk/openai-compatible`
- The `crimson_markov` Rust crate provides Markov chain functionality
- Environment variables loaded from `.env`
