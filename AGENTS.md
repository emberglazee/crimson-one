# AGENTS.md - Guidelines for AI Coding Agents

This document provides comprehensive guidelines for AI coding agents operating within the Crimson-One Discord bot codebase.

## 1. Project Overview

Crimson-One is a modern Discord bot built with the Bun runtime, focusing on AI chat, moderation, webhooks, and advanced Markov chain capabilities.

- **Primary Language:** TypeScript (ES Modules, `"type": "module"`)
- **Runtime:** Bun v1.3.11+
- **Database:** PostgreSQL + 3 SQLite databases via TypeORM
- **Dependency Injection:** `tsyringe`
- **Native Extensions:** Rust-based subproject (`crimson_markov/`)

## 2. Build, Run, and Test Commands

### Running the Application

```bash
# Start the primary bot process (using the guardian wrapper)
bun src/guardian.ts
# OR
npm start

# Run the CLI dashboard (React/ink-based)
npm run dashboard

# Delete all registered Discord commands
npm run delete-commands
```

### Linting & Formatting

```bash
# Check for linting and formatting errors
npm run lint

# Automatically fix linting and formatting issues
npm run lint:fix
```

### Testing (Bun Test Runner)

**Note:** Currently, no test files exist in the project. The following commands are provided for future reference when tests are added.

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

### Process Management (PM2)

```bash
# Start with PM2
pm2 start pm2.config.cjs

# View logs
pm2 logs crimson-one

# Restart/stop
pm2 restart crimson-one
pm2 stop crimson-one
```

### Rust Subproject (`crimson_markov/`)

```bash
# Check for compilation errors without building
npm run markov:check
# OR
cd crimson_markov && cargo check

# Build the release binary
npm run markov:build
# OR
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
- **Avoiding `any`:** ESLint enforces `@typescript-eslint/no-explicit-any`. When encountering type challenges:
    1. **First priority:** Define or locate an existing type/interface that accurately represents the data structure.
    2. **Second priority:** If the full type is too complex or scope is too large, strictly type as much as possible and use `unknown` for truly dynamic portions (requires type guards/assertions before use).
    3. **Last resort:** Use `ExplicitAny` (defined in `src/types/index.ts`) only when `unknown` is impractical and the type cannot be reasonably inferred. This is a project-specific alias for `any` that bypasses the ESLint rule while signaling intentional usage.

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
- **Discord Commands:** Implement commands utilizing `SlashCommandBuilder` and ensure they satisfy the `SlashCommand` interface. Commands support both slash commands and legacy text commands (prefix-based) through a unified `CommandContext` interface.
- **Discord Events:** Placed in `src/events/`, each file must export a default handler function.
- **Math Evaluation (`math.js`):** User-provided math expressions are evaluated using `math.js` directly in the main thread within `src/events/messageCreate.ts` (lines 60-86). The evaluation includes custom utility/meme units (e.g., `embil`, `embim`, `ly`, `au`, `c0`). Note: This is NOT sandboxed or isolated.
- **Worker Threads:** CPU-intensive operations use Node.js `worker_threads` (NOT Web Workers):
    - `src/modules/MarkovChain/worker.ts` - Markov chain generation, training, and statistics
    - `src/modules/SubtitleGenerator/worker.ts` - Subtitle image generation with canvas rendering
    - Workers communicate via message passing and maintain task queues for concurrent operations.

### ESLint Configuration

The project uses a custom ESLint configuration (`eslint.config.ts`) with the following key rules:

- **No trailing spaces:** `no-trailing-spaces: 'error'`
- **End of line:** `eol-last: 'error'` (files must end with newline)
- **No async promise executor:** Disabled (`no-async-promise-executor: 'off'`)
- **No case declarations:** Disabled (`no-case-declarations: 'off'`)
- **Empty object types:** Allowed (`@typescript-eslint/no-empty-object-type: 'off'`)
- **Unused expressions:** Allowed (`@typescript-eslint/no-unused-expressions: 'off'`)
- **Infix operators:** Must have spacing (`@stylistic/space-infix-ops: ['error']`)

### Prettier Configuration

The project uses Prettier with the following settings (`.prettierrc`):

- **Semicolons:** `false` (no semicolons)
- **Quotes:** `singleQuote: true`
- **Tab Width:** `4` spaces
- **Bracket Spacing:** `true` (spaces inside object literals)

## 4. Directory Structure

```text
crimson-one/
├── src/
│   ├── commands/    # Modular Discord slash commands (40+ commands)
│   ├── events/      # Discord event listeners
│   ├── modules/     # DI services and core business logic
│   ├── types/       # Global TypeScript declarations
│   ├── util/        # Pure helper functions
│   ├── migrations/  # TypeORM database schema migrations
│   ├── guardian.ts  # Process wrapper & auto-updater
│   ├── index.ts     # Primary application bootstrap
│   └── init.ts      # First-time environment setup script
├── dashboard/       # React/Ink CLI frontend
├── data/            # Runtime data, fonts, audio files, SQLite databases
├── scripts/         # Utility scripts (one-commit-back.sh)
├── logs/            # Application logs (auto-generated)
└── crimson_markov/  # High-performance Rust text generation crate
```

## 5. Git Commit Message Format

**Format:** `<prefix>(<indicator>): <description>`

**Prefixes:**

- `feat`: New feature
- `fix`: Bug fix
- `style`: Code style/formatting changes (no logic change)
- `refactor`: Code restructuring (no behavior change)
- `docs`: Documentation changes
- `remove`: Removing code/features
- `undo`: Reverting changes

**Indicator Priority (optional, use most specific applicable):**

1. **Specific command:** `feat(/colorrole): 'setfor' subcommand`
2. **Specific class:** `style(RateLimiter): eslint fixes`
3. **General file:** `docs(agents.md): expand agent documentation`
4. **Folder:** `style(commands/*): eslint fixes for all commands`

**Multiple Changes:**

- Group related changes: `refactor,style(CommandLoader): improve command deployment; eslint fixes`
- Multiple components: `feat(Logger, RateLimiter): better logging`

**Wide Changes:**

- Omit indicator for broad changes: `refactor: restructure project architecture`

**Examples:**

```
feat(/botnick): add bot nickname command
fix(QOTDForwarder): prevent message loop
style(commands/*): apply consistent formatting
refactor,fix(ReactionRoleManager): improve validation; fix race condition
docs: update development workflow
```

**Goal:** Make git history navigable and changes easily identifiable from one-line history.

## 6. Database Architecture

The bot uses multiple databases for different purposes:

- **PostgreSQL:** Markov chain training data (messages, n-grams, statistics)
- **SQLite** (3 separate databases):
    - `data/guild-config.sqlite` - Guild-specific settings and configurations
    - `data/tag-system.sqlite` - Tag storage per guild
    - `data/long-term-memory.sqlite` - CrimsonChat conversation memory

All databases are managed via TypeORM with migrations in `src/migrations/`.

## 7. Command Execution Architecture

Commands support both slash commands and legacy text commands through a unified system:

### Command Flow

1. **Slash Commands:** Discord interactions → `CommandManager.handleInteraction()` → `CommandContext`
2. **Text Commands:** Message with prefix → `TextCommandParser` (uses `yargs`) → `CommandContext`
3. **Execution:** Both paths converge to `executeUnifiedCommand()` with the same interface

### CommandContext

The `CommandContext` class provides a unified interface for both command types:

- Service injection (9 different services: Logger, DatabaseService, etc.)
- Type-safe option getters with overloads for different option types
- Installation type detection (Guild vs User Install)
- Reply chaining and deferred reply support
- Automatic help generation for text commands

### Command Structure

```typescript
export default {
    data: new SlashCommandBuilder()
        .setName('example')
        .setDescription('Example command'),
    async execute(ctx: CommandContext) {
        // Access services via ctx
        // Get options via ctx.options.getString('name')
        // Reply via ctx.reply()
    },
} satisfies SlashCommand
```

## 8. Process Management & Guardian

### Guardian Process Manager

`src/guardian.ts` wraps the main bot process and provides:

- **Auto-restart:** Monitors for crashes and restarts automatically (max 3 attempts)
- **Update handling:** Receives IPC messages (`UPDATE_REQUEST`) to trigger git pull updates
- **Automatic rollback:** Tracks git commit hashes and rolls back to last known good commit on repeated failures
- **Crash recovery:** Maintains uptime by restarting the bot process on unexpected exits

The guardian is the recommended way to run the bot in production (via `npm start` or `bun src/guardian.ts`).

## 9. Core Modules Reference

Key modules that agents should be aware of:

- **CommandManager:** Handles slash command registration and execution
- **Logger:** Centralized logging (use instead of `console.log`)
- **GracefulShutdown:** Handles SIGTERM, SIGINT, SIGUSR2 for clean shutdowns
- **OperationTracker:** Tracks long-running operations for graceful shutdown coordination
- **ProgressTracker:** Displays progress bars for long operations in Discord
- **BotSettingsManager:** Debug mode toggle and bot-wide settings
- **InteractionMessageManager:** Message management utilities for interactions
- **MarkovBotManager:** Manages Markov bot instances per channel
- **AntiRaidManager:** Anti-raid protection and detection
- **DashboardServer:** Web dashboard (default port: 9826)
- **AWACSFeed:** Audit log monitoring and forwarding
- **SleepAsAndroidWebhook:** Sleep tracking integration

## 10. Environment Configuration

See `.env.example` for all available environment variables. Key categories:

- **Required:** `DISCORD_TOKEN`, `POSTGRES_*` (5 variables for database connection)
- **AI/APIs:** `OPENAI_API_KEY`, `YOUTUBE_API_KEY`, `STEAM_API_KEY`, `TMDB_API_KEY`
- **Webhooks:** `GITHUB_WEBHOOK_*`, `SLEEP_WEBHOOK_*`
- **Ports:** `DASHBOARD_PORT` (default: 9826)
- **Optional:** Various feature flags and service integrations

## 11. Utility Functions

`src/util/functions.ts` contains 767 lines of utility functions including:

- **Discord helpers:** `getUserAvatar()`, `findMember()`, `getGuildIcon()`
- **Time/duration:** `parseDuration()`, `formatDuration()`, `parseTime()`
- **Text manipulation:** `drunkWrite()`, `owoTranslate()`, `capitalizeFirst()`
- **YouTube utilities:** `extractVideoId()`, `formatYoutubeComment()`
- **Array/randomization:** `shuffleArray()`, `randomChoice()`, `weightedRandom()`
- **Cookie parsing:** For browser automation tasks

Use `resolveServices()` helper to resolve multiple services from the DI container at once.

## 12. Agent Instructions Context

- **Tool Usage:** Always read configuration files, package.json, and tsconfig.json to understand dependencies and settings before executing large refactors.
- **Testing:** If modifying logic, verify via `bun test` if a corresponding `.test.ts` file exists. Currently, no test files exist in the project.
- **Database Migrations (SQLite):** Do _not_ migrate to `better-sqlite3` as it is not currently supported by Bun as of v1.3.10 (track at https://github.com/oven-sh/bun/issues/4290). Additionally, do not attempt to migrate from `node-sqlite3` to Bun's native SQLite driver, as it is not supported by TypeORM. TypeORM's 2026 H1 roadmap states they will be migrating away from `node-sqlite3` for not being maintained, but it remains the only viable choice despite the recent v6 release.
- **Rules Environment:** There are currently no `.cursorrules` or Copilot instruction files. This file acts as the primary rulebook for AI operations.
