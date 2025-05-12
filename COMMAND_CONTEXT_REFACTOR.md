# Command System Refactor: Unified CommandContext

This document outlines the steps to refactor the command system to treat both message-based and interaction-based commands on even ground, using a neutral `CommandContext` abstraction. The goal is to simplify the codebase, reduce complexity, and make it easier to maintain and extend.

---

## Refactor Steps

### 1. Define a Neutral CommandContext Interface
- Expose only the properties and methods that are truly common to both messages and interactions.
- Example properties: `user`, `channel`, `guild`, `member`, `client`, `commandName`, `reply()`, `deferReply()`, `editReply()`, `followUp()`.
- Optionally include: `interaction?`, `message?` for advanced use cases.
- Avoid faking all interaction features for messages.

### 2. Implement Two Context Subclasses
- `InteractionCommandContext` for interactions (slash/context menu).
- `MessageCommandContext` for messages.
- Both should implement the `CommandContext` interface and provide the required methods/properties.

### 3. Refactor CommandManager to Use the Unified Context
- In `handleInteraction`, create an `InteractionCommandContext` and pass it to the command.
- In `handleMessage`, create a `MessageCommandContext` and pass it to the command.
- Remove code that tries to make messages look like interactions or vice versa.

### 4. Update Command Definitions
- Update the `execute` signature for all commands to accept the new context.
- If a command needs something specific, let it check `context.interaction` or use a type guard.

### 5. Simplify Option Parsing
- For interactions: expose the real options object.
- For messages: optionally provide a simple parsed arguments array or object, but don't try to fully emulate interaction options.
- Document the limitations for message-based commands.

### 6. Test Both Flows Thoroughly
- Ensure both message and interaction commands work as expected.
- Check that replies, deferrals, edits, and follow-ups work in both cases.
- Ensure error handling is consistent.

### 7. Document the New System
- Document the `CommandContext` interface and its intended use.
- Explain how to write commands that work for both messages and interactions.
- Note any caveats or differences between the two flows.

### 8. (Optional) Clean Up and Remove Old Bridging Code
- Remove any legacy code that tried to bridge messages/interactions in a hacky way.
- Delete or refactor any utility functions, types, or helpers that are no longer needed.

---

## Progress Table

| Step | Description | Status |
|------|-------------|--------|
| 1    | Define a neutral CommandContext interface | ⬜ Not Started |
| 2    | Implement InteractionCommandContext and MessageCommandContext | ⬜ Not Started |
| 3    | Refactor CommandManager to use unified context | ⬜ Not Started |
| 4    | Update command definitions to use new context | ⬜ Not Started |
| 5    | Simplify option parsing for both flows | ⬜ Not Started |
| 6    | Test both message and interaction flows | ⬜ Not Started |
| 7    | Document the new system and usage | ⬜ Not Started |
| 8    | Clean up and remove old bridging code | ⬜ Not Started |

---

**Legend:**
- ⬜ Not Started
- 🟨 In Progress
- ✅ Complete 