# crimson-one

perhaps the worst discord bot known to the solar system and beyond

***i am too lazy to write something meaningful here so enjoy some ai slop description***

## Functionality

The `src` directory contains all the core logic for the bot, organized into the following key areas:

### Core Logic (`index.ts`, `guardian.ts`)

- **`index.ts`**: The main entry point for the bot. It initializes the Discord client, loads all modules, commands, and event handlers.
- **`guardian.ts`**: A process manager that wraps the main bot process. It handles automatic restarts on crashes, pulls updates from Git, and manages a graceful shutdown procedure.

### Modules (`src/modules`)

This directory contains the core features of the bot, each encapsulated in its own module:

- **`CommandManager`**: A robust system for loading, registering, and executing application commands. It supports both slash commands and legacy prefix-based text commands, with hot-reloading for development.
- **`CrimsonChat`**: The primary personality of the bot, powered by the Google Gemini API. It functions as an AI chat assistant in the persona of "Crimson 1" from *Project Wingman*. It can use tools to perform actions like moderation and sending embeds.
- **`ShapesInc`**: An alternative chat mode that integrates with the `shapes.inc` character AI service.
- **`ModeManager`**: Manages the active chat personality, switching between `CrimsonChat` and `ShapesInc`.
- **`MarkovChain`**: A module to generate new messages based on text collected from server chat history. The performance-critical chain-building logic is written in Rust and integrated via Bun's FFI for maximum speed. It can be trained on data from specific users, channels, or an entire server.
- **`BanishmentManager`**: Implements a custom "banishment" system that assigns a specific role to users, with support for timed durations.
- **`QuoteImageFactory`**: Generates images styled as subtitles from games like *Ace Combat 7*, *Project Wingman*, and *Helldivers 2*.
- **`AWACSFeed`**: Logs server events (member joins/leaves, bans, role changes) to a dedicated channel with a thematic "AWACS" flair.
- **`GuildConfig`**: Manages server-specific configurations, such as command prefixes and feature toggles, stored in a SQLite database.
- **Other Modules**: Includes a `DashboardServer` for a web-based monitoring interface, a `GithubWebhook` handler, and an `OperationTracker` for monitoring long-running tasks.

### Commands (`src/commands`)

Contains the definitions for all user-facing commands, categorized as follows:

- **Fun & Meme**: `8ball`, `ac7portrait`, `aldo`, `drunk`, `huh`, `myresolution`, `owo`, `poortranslate`, `preble`, `randombilly`, `roll`, `russianroulette`, `subtitle`, `cutoutro`.
- **Utility & Info**: `avatar`, `banner`, `config`, `gotomessage`, `hoi4hours`, `roleinfo`, `user`.
- **Moderation**: `banish`, `unbanish`, `duplicate` (roles).
- **Owner-Only**: `bot` (manage presence), `crimsonchat` (control AI), `debug`, `eval`, `mode`, `reload`, `shapesinc`, `update`.

### Event Handlers (`src/events`)

Each file in this directory corresponds to a Discord gateway event. This includes handling command interactions (`interactionCreate`), processing messages for triggers and AI responses (`messageCreate`), and logging message edits/deletions to the AI chat channel.

### Utilities & Types (`src/util`, `src/types`)

- **`util`**: A collection of helper functions, constants, and a custom logger used throughout the project.
- **`types`**: Contains shared TypeScript interfaces and type definitions for commands, events, and module data structures.
