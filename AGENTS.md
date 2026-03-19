# AGENTS.md - Guidelines for AI Coding Agents

This document provides comprehensive guidelines for AI coding agents operating within the Crimson-One Discord bot codebase.

## 1. Project Overview

Crimson-One is a modern Discord bot built with the Bun runtime, focusing on AI chat, moderation, webhooks, and advanced Markov chain capabilities.

- **Primary Language:** TypeScript (ES Modules, `"type": "module"`)
- **Runtime:** Bun
- **Database:** PostgreSQL/SQLite via TypeORM
- **Dependency Injection:** `tsyringe`
- **Native Extensions:** Rust-based subproject (`crimson_markov/`)

## 2. Build, Run, and Test Commands

### Running the Application

```bash
# Start the primary bot process (using the guardian wrapper)
bun src/guardian.ts

# Run the CLI dashboard (React/ink-based)
npm run dashboard
```

### Linting & Formatting

```bash
# Check for linting and formatting errors
npm run lint

# Automatically fix linting and formatting issues
npm run lint:fix
```

### Testing (Bun Test Runner)

```bash
# Run all tests in the repository
bun test

# Run a specific test file
bun test path/to/file.test.ts

# Run a single test by exact name match
bun test -t "should handle user input correctly" path/to/file.test.ts

# Run tests in watch mode
bun test --watch
```

### Rust Subproject (`crimson_markov/`)

```bash
# Check for compilation errors without building
cd crimson_markov && cargo check

# Build the release binary
cd crimson_markov && cargo build --release

# Run Rust tests
cd crimson_markov && cargo test
```

## 3. Code Style Guidelines

### Formatting & Syntax

- **Runtime APIs:** Strictly use Bun APIs. Avoid Node.js-specific APIs (`fs`, `path`) where Bun provides native equivalents (`Bun.file`, `Bun.write`).
- **Semicolons:** **NEVER** use semicolons. (`@stylistic/semi: ['error', 'never']`)
- **Quotes:** Use single quotes (`'`), except when avoiding escapes (`avoidEscape: true`).
- **Indentation:** 4 spaces (`tabWidth: 4`).
- **Trailing Commas:** **NEVER** use trailing commas. (`comma-dangle: ['error', 'never']`). Do not use them in arrays, objects, imports, exports, or function parameters.
- **Arrow Functions:** Use parentheses only when necessary (e.g., `x => x` instead of `(x) => x`).
- **Function Spacing:**
    - Anonymous: `function ()` (space before paren)
    - Named: `function name()` (no space)
    - Async arrow: `async () =>` (space before paren)
- **Member Delimiters:** Multiline interfaces must have NO delimiters. Single-line interfaces must use commas.
- **Unused Variables:** Allowed only if prefixed with an underscore (`_`).

### Types & Interfaces

- **Strict Mode:** TypeScript `strict` mode is enabled. All typings must be explicit and accurate.
- **Imports:** Use `verbatimModuleSyntax: true`. You must import types using the `type` keyword (`import type { User } from 'discord.js'`).
- **Decorators:** Experimental decorators are enabled strictly for TypeORM models and `tsyringe` DI classes.

### Naming Conventions

- **Classes/Services:** `PascalCase` (e.g., `CommandManager`, `DatabaseService`).
- **Interfaces/Types:** `PascalCase` with highly descriptive names (e.g., `WebhookPayload`, `ChatConfig`).
- **Functions/Methods:** `camelCase` (e.g., `initializeBot`, `fetchUserData`).
- **Variables/Properties:** `camelCase` (e.g., `messageContent`, `userList`).
- **Constants:** `UPPER_SNAKE_CASE` (e.g., `MAX_RETRIES`, `DEFAULT_TIMEOUT`).
- **Private Members:** Prefix with an underscore (e.g., `_connectionPool`, `_logInternal()`).
- **Files:** `camelCase` (e.g., `commandHandler.ts`) or `PascalCase` if the file exports a single class matching that name.

### Import Organization

Sort imports systematically into distinct groups, separated by a blank line:

1. **External/Runtime:** `bun`, `discord.js`, `tsyringe`, `typeorm`, etc.
2. **Internal/Local:** Relative imports (`./modules`, `../util/helpers`).
3. **Types:** All `import type` declarations.
4. **Side-effects:** Polyfills or initializers like `import 'reflect-metadata'`.

```typescript
// External
import { container, singleton } from 'tsyringe'
import { EmbedBuilder } from 'discord.js'

// Internal
import { Logger } from './logger'

// Types
import type { LogLevel } from '../types/logger'

// Side-effects
import 'reflect-metadata'
```

### Error Handling

- **Graceful Shutdown:** Uncaught errors and signal interruptions should be caught and routed through the `GracefulShutdown` handler.
- **Logging:** Do not use `console.log`. Use the internal `Logger` class resolving from the DI container.
- **Promises:** Prefer `async/await` with comprehensive `try/catch` blocks.
- **Control Flow:** Emphasize early returns to prevent deep and unreadable conditional nesting.

### Architecture & Patterns

- **Dependency Injection:** Utilize `tsyringe` heavily. Register classes in the global container. Use `@injectable()` and `@singleton()`.
- **Discord Commands:** Implement commands utilizing `SlashCommandBuilder` and ensure they satisfy the `SlashCommand` interface.
- **Discord Events:** Placed in `src/events/`, each file must export a default handler function.
- **Math Evaluation (`math.js`):** User-provided math expressions are evaluated using `math.js` inside an isolated Web Worker (`src/workers/mathWorker.ts`) wrapped by `src/util/mathEvaluator.ts`. This worker runs with an empty environment (`env: {}`) and a strict timeout to prevent sandbox escapes, infinite loops, and environment variable leaks. The worker disables dangerous functions (`import`, `createUnit`, `reviver`) and includes custom utility/meme units (e.g., `embil`, `embim`, `ly`, `au`).

## 4. Directory Structure

```text
crimson-one/
├── src/
│   ├── commands/    # Modular Discord slash commands
│   ├── events/      # Discord event listeners
│   ├── modules/     # DI services and core business logic
│   ├── types/       # Global TypeScript declarations
│   ├── util/        # Pure helper functions
│   ├── migrations/  # TypeORM database schema migrations
│   ├── guardian.ts  # Process wrapper & auto-updater
│   ├── index.ts     # Primary application bootstrap
│   └── init.ts      # First-time environment setup script
├── dashboard/       # React/Ink CLI frontend
└── crimson_markov/  # High-performance Rust text generation crate
```

## 5. Agent Instructions Context

- **Tool Usage:** Always read configuration files, package.json, and tsconfig.json to understand dependencies and settings before executing large refactors.
- **Testing:** If modifying logic, verify via `bun test` if a corresponding `.test.ts` file exists.
- **Database Migrations (SQLite):** Do _not_ migrate to `better-sqlite3` as it is not currently supported by Bun as of v1.3.10 (track at https://github.com/oven-sh/bun/issues/4290). Additionally, do not attempt to migrate from `node-sqlite3` to Bun's native SQLite driver, as it is not supported by TypeORM. TypeORM's 2026 H1 roadmap states they will be migrating away from `node-sqlite3` for not being maintained, but it remains the only viable choice despite the recent v6 release.
- **Rules Environment:** There are currently no `.cursorrules` or Copilot instruction files. This file acts as the primary rulebook for AI operations.
