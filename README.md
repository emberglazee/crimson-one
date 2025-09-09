# crimson-one

Perhaps the worst discord bot known to the solar system and beyond.

---

## For Users: What Can I Do With This Bot?

This is a quick guide to the fun and useful things you can do with Crimson One on your Discord server.

### Core Features

* **AI Chat**: Mention **@crimson-one** in a designated channel to talk with an AI in the persona of Crimson 1 from *Project Wingman*.
* **Markov Chains**: The bot can learn from your server's chat history to generate new, often nonsensical messages. Use `/markov generate` to try it out!
* **Tag System**: Save and recall snippets of text, links, or images.
  * `%tagname` - Display a tag.
  * `%=tagname <content>` - Create or update a tag.
  * `%-tagname` - Delete a tag.
* **Math**: Quickly solve math problems by typing `% 5+5` (or any other expression).

### Fun & Meme Commands

* `/8ball <question>`: Ask the magic 8-ball a question with different themes.
* `/ac7portrait`: Generate an *Ace Combat 7*-style portrait of a user's avatar or a custom image.
* `/subtitle`: Create a subtitle image in the style of *Ace Combat 7*, *Project Wingman*, *Ace Combat Zero*, or *Helldivers 2*.
* `/drunk <text>`: Make your text look like it was typed by a drunk person.
* `/owo <text>`: OwO-ify your text.
* `/poortranslate <text>`: Translate your text through a dozen different languages and back for a terrible result.
* `/roll`: Roll dice with various options (d6, d20, d100, custom, or roll until you get a number).
* `/russianroulette`: Play a game of Russian Roulette.
* And more! Try `/aldo`, `/ben`, `/huh`, `/kill`, `/myresolution`, `/preble`, and `/randombilly`.

### Utility & Info Commands

* `/avatar [user]`: Get a user's profile picture.
* `/banner [user]`: Get a user's profile banner.
* `/user [user]`: Show detailed information about a user's Discord account and server profile.
* `/roleinfo <role>`: Get detailed information about a server role.
* `/hoi4hours`: Check how many hours a certain someone (me) has spent playing Hearts of Iron 4.
* `/gotomessage <message_id>`: Generate a link to jump to a specific message.

### Moderation Commands

* `/banish <member> [duration] [reason]`: Temporarily or permanently restrict a user's access with a special "banished" role.
* `/unbanish <member> [reason]`: Remove the "banished" role from a user.
* `/duplicate role <role>`: Create a perfect copy of an existing role, including its permissions.

---

## For Developers: Backend Features & Architecture

This section provides a technical overview of the bot's structure and core components.

### Core Logic (`index.ts`, `guardian.ts`)

* **`index.ts`**: The main entry point for the bot. It initializes the Discord client, loads all modules, commands, and event handlers using `tsyringe` for dependency injection.
* **`guardian.ts`**: A process manager that wraps the main bot process. It handles automatic restarts on crashes, pulls updates from Git via a command, and manages a graceful shutdown procedure to ensure all operations complete.

### Modules (`src/modules`)

This directory contains the core features of the bot, each encapsulated in its own module:

* **`CommandManager`**: A robust system for loading, registering, and executing application commands. It supports both slash commands and legacy prefix-based text commands, with hot-reloading for development.
* **`CrimsonChat`**: The primary personality of the bot, powered by the Google Gemini API. It functions as an AI chat assistant in the persona of "Crimson 1" from *Project Wingman*. It can use a variety of tools to perform actions like moderation, sending embeds, creating polls, and changing its own status.
* **`MarkovChain`**: A module to generate new messages based on text collected from server chat history. The performance-critical chain-building and generation logic is written in **Rust** and integrated via Bun's FFI for maximum speed. It can be trained on data from specific users, channels, or an entire server, with data stored in a PostgreSQL database.
* **`BanishmentManager`**: Implements a custom "banishment" system that assigns a specific role to users, with support for timed durations stored in a JSON file.
* **`SubtitleGenerator`**: Generates images styled as subtitles from games like *Ace Combat 7*, *Project Wingman*, *Ace Combat Zero*, and *Helldivers 2*, with support for custom colors, gradients, and emoji rendering.
* **`AWACSFeed`**: Logs server events (member joins/leaves, bans, role changes) to a dedicated channel with a thematic "AWACS" flair by monitoring the Discord audit log.
* **`GuildConfig`**: Manages server-specific configurations, such as command prefixes and feature toggles, stored in a SQLite database using TypeORM.
* **Other Modules**: Includes a `DashboardServer` for a web-based monitoring interface, a `GithubWebhook` handler, and an `OperationTracker` for monitoring long-running tasks to ensure graceful shutdowns.

### Commands (`src/commands`)

Contains the definitions for all user-facing commands, which are automatically loaded and registered by the `CommandManager`.

### Event Handlers (`src/events`)

Each file in this directory corresponds to a Discord gateway event (e.g., `messageCreate`, `interactionCreate`). This modular approach keeps the main file clean and organizes event-based logic.

### Utilities & Types (`src/util`, `src/types`)

* **`util`**: A collection of helper functions, constants, and a custom logger used throughout the project.
* **`types`**: Contains shared TypeScript interfaces and type definitions for commands, events, and module data structures.
