# crimson-one

Perhaps the worst discord bot known to the solar system and beyond.

Invite it: https://discord.com/oauth2/authorize?client_id=1309994202351931522 (both user and guild install available)

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

*   **`util`**: A collection of helper functions, constants, and a custom logger used throughout the project.
*   **`types`**: Contains shared TypeScript interfaces and type definitions for commands, events, and module data structures.

---

## For Developers: Setup & Installation

This guide provides detailed instructions for setting up the Crimson One bot from scratch on a fresh Debian-based Linux distribution (like Debian or Ubuntu).

### 1. Prerequisites

Before you begin, ensure you have the following software installed on your system.

#### System Dependencies

First, update your package lists:
```bash
sudo apt update
```

Then, install the essential tools and libraries for building native Node.js modules (like `canvas`) and other dependencies:
```bash
sudo apt install -y git build-essential pkg-config libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev ffmpeg
```
- **Ubuntu vs. Debian**: These commands should work on both recent versions of Ubuntu (20.04+) and Debian (11+). On older versions, you might need to find equivalent packages.

#### PostgreSQL Database

The bot uses PostgreSQL for its Markov chain data.
```bash
sudo apt install -y postgresql postgresql-contrib
```
After installation, you'll need to create a database and a user for the bot.
```bash
sudo -u postgres psql
```
Then, in the PostgreSQL prompt, run the following commands:
```sql
CREATE DATABASE crimson_one;
CREATE USER crimson_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE crimson_one TO crimson_user;
\q
```
Remember to use a strong, unique password.

#### Rust & Cargo

The Markov chain's core logic is written in Rust for performance. The recommended way to install Rust is using `rustup`:
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```
Follow the on-screen instructions. You may need to restart your terminal or run `source "$HOME/.cargo/env"` to add Rust to your system's `PATH`.

#### Bun Runtime

The bot uses Bun as its primary JavaScript runtime and package manager.
```bash
curl -fsSL https://bun.sh/install | bash
```
Follow the instructions provided by the installer to add Bun to your `PATH`.

#### Node.js & npm (for PM2)

While Bun is the main runtime, `pm2` (a process manager) currently works more reliably when installed via `npm`.
```bash
sudo apt install -y nodejs npm
```

### 2. Installation Steps

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/emberglazee/crimson-one.git
    cd crimson-one
    ```

2.  **Create Environment File:**
    Create a `.env` file in the root of the project. This file will store all your secret keys and configuration variables. An example file is provided.
    ```bash
    cp .env.example .env
    ```
    Now, edit the `.env` file with your favorite text editor (e.g., `nano .env`) and fill in the required values.

3.  **Install Dependencies:**
    Use Bun to install all the Node.js dependencies listed in `package.json`.
    ```bash
    bun install
    ```

4.  **Build the Rust Module:**
    Compile the Rust-based Markov chain module into a shared library that Bun can call via FFI.
    ```bash
    bun run build:markov
    ```
    This will create a `libcrimson_markov.so` file in `crimson_markov/target/release/`.

5.  **Install PM2:**
    Install the `pm2` process manager globally using `npm`.
    ```bash
    sudo npm install -g pm2
    ```
    **Note**: It is highly recommended to use `npm` for `pm2` instead of `bunx pm2` or `bun add global pm2`. This is due to current incompatibilities with Bun's process management that can cause issues with `pm2`'s daemon and debugging features.

### 3. Environment Variables (`.env`)

Your `.env` file is crucial for the bot to function. See `.env.example` for a full list of variables. At a minimum, you will need:

- `DISCORD_TOKEN`: Your bot's token from the Discord Developer Portal.
- `POSTGRES_*`: Your PostgreSQL connection details.

### 4. Running the Bot

We use `pm2` to run the bot as a persistent background process. This ensures it restarts automatically if it crashes.

1.  **Start the bot:**
    ```bash
    pm2 start pm2.config.cjs
    ```

2.  **View Logs:**
    To monitor the bot's output in real-time:
    ```bash
    pm2 logs crimson-one
    ```

3.  **Manage the Process:**
    You can easily manage the bot process with these commands:
    - `pm2 stop crimson-one`
    - `pm2 restart crimson-one`
    - `pm2 delete crimson-one`

4.  **Enable Startup on Reboot:**
    To ensure `pm2` automatically restarts the bot after a server reboot, run:
    ```bash
    pm2 startup
    ```
    It will provide a command you need to run with `sudo`.
    After that, save the current process list:
    ```bash
    pm2 save
    ```

