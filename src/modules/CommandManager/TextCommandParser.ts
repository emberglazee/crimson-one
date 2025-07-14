import { Logger } from '../../util/logger'
const logger = new Logger('TextCommandParser')

import { Message, ApplicationCommandOptionType } from 'discord.js'
import type { APIApplicationCommandOption, APIApplicationCommandSubcommandGroupOption, APIApplicationCommandSubcommandOption } from 'discord.js'
import type { SlashCommand, JSONResolvable } from '../../types'
import type { ArgumentsCamelCase, Argv, Options as YargsOptions } from 'yargs'
import yargs from 'yargs'
import { CommandContext } from './CommandContext'

export class TextCommandParser {
    public static async createContextForMessageCommand(message: Message, command: SlashCommand, rawArgsString: string, prefix: string): Promise<CommandContext> {
        const finalArgsString = this._reconstructArgumentsForYargs(rawArgsString, command)
        const yargsParser = this.buildYargsParserForCommand(command, message, finalArgsString, prefix)

        const parsedYargsArgs = await yargsParser.parseAsync()

        const context = new CommandContext(message, rawArgsString.split(/ +/))
        context.parsedArgs = parsedYargsArgs as ArgumentsCamelCase<{ [key: string]: JSONResolvable }>

        this._setSubcommandContextFromArgs(context, parsedYargsArgs, command.data.toJSON())

        return context
    }

    public static parseCommandFromMessage(content: string, prefix: string): { commandName: string | null; rawArgsString: string } {
        const contentWithoutPrefix = content.slice(prefix.length).trim()
        const commandName = contentWithoutPrefix.split(/ +/)[0]?.toLowerCase() ?? null
        const firstSpaceIndex = contentWithoutPrefix.indexOf(' ')
        const rawArgsString = firstSpaceIndex !== -1 ? contentWithoutPrefix.substring(firstSpaceIndex + 1).trimStart() : ''
        return { commandName, rawArgsString }
    }

    private static _reconstructArgumentsForYargs(rawArgsString: string, command: SlashCommand): string {
        const commandData = command.data.toJSON()
        const allTokens = this.tokenizeArgs(rawArgsString)

        const commandPath: string[] = []
        let activeOptions: readonly APIApplicationCommandOption[] = commandData.options ?? []
        let argsStartIndex = 0

        if (allTokens.length > 0) {
            let currentLevelOptions: readonly APIApplicationCommandOption[] = commandData.options ?? []
            const groupDef = currentLevelOptions.find(o => o.name === allTokens[0] && o.type === ApplicationCommandOptionType.SubcommandGroup)
            if (groupDef) {
                commandPath.push(allTokens[0])
                argsStartIndex = 1
                currentLevelOptions = (groupDef as APIApplicationCommandSubcommandGroupOption).options ?? []
                if (allTokens.length > 1) {
                    const subDef = currentLevelOptions.find(o => o.name === allTokens[1] && o.type === ApplicationCommandOptionType.Subcommand)
                    if (subDef) {
                        commandPath.push(allTokens[1])
                        argsStartIndex = 2
                        activeOptions = (subDef as APIApplicationCommandSubcommandOption).options ?? []
                    }
                }
            } else {
                const subDef = currentLevelOptions.find(o => o.name === allTokens[0] && o.type === ApplicationCommandOptionType.Subcommand)
                if (subDef) {
                    commandPath.push(allTokens[0])
                    argsStartIndex = 1
                    activeOptions = (subDef as APIApplicationCommandSubcommandOption).options ?? []
                }
            }
        }

        const argTokens = allTokens.slice(argsStartIndex)
        const requiredOptions = activeOptions.filter(opt => opt.required)

        const positionalValues: string[] = []
        const flaggedTokens: string[] = []
        let inFlagsSection = false
        for (const token of argTokens) {
            if (token.startsWith('-')) {
                inFlagsSection = true
            }
            if (inFlagsSection) {
                flaggedTokens.push(token)
            } else {
                positionalValues.push(token)
            }
        }

        const reconstructedArgs: string[] = [...commandPath]

        positionalValues.forEach((value, index) => {
            if (index < requiredOptions.length) {
                const option = requiredOptions[index]
                reconstructedArgs.push(`--${option.name}`)
                reconstructedArgs.push(value)
            } else {
                reconstructedArgs.push(value)
            }
        })

        reconstructedArgs.push(...flaggedTokens)

        return reconstructedArgs
            .map(arg => (/\s/).test(arg) ? `"${arg.replace(/"/g, '"')}"` : arg)
            .join(' ')
    }

    private static _setSubcommandContextFromArgs(context: CommandContext, parsedArgs: ArgumentsCamelCase, commandData: { options?: APIApplicationCommandOption[] }): void {
        const yargsCommandPath = parsedArgs?._?.map(String) ?? []
        const options = commandData.options ?? []
        const commandPathForContext = [...yargsCommandPath]

        if (options.some(o => o.type === ApplicationCommandOptionType.SubcommandGroup)) {
            const potentialGroup = commandPathForContext[0]
            if (potentialGroup && options.find(o => o.name === potentialGroup && o.type === ApplicationCommandOptionType.SubcommandGroup)) {
                context.subcommandGroupName = commandPathForContext.shift() || null
            }
        }
        if (
            options.some(o => o.type === ApplicationCommandOptionType.Subcommand) ||
            (() => {
                const group = context.subcommandGroupName && options.find(
                    (o): o is APIApplicationCommandSubcommandGroupOption =>
                        o.name === context.subcommandGroupName &&
                        o.type === ApplicationCommandOptionType.SubcommandGroup &&
                        Array.isArray(o.options)
                )
                return !!(group && Array.isArray(group.options) &&
                    group.options.some(subOpt => subOpt.type === ApplicationCommandOptionType.Subcommand)
                )
            })()
        ) {
            const potentialSubcommand = commandPathForContext[0]
            if (potentialSubcommand) {
                let subOptExists = false
                if (context.subcommandGroupName) {
                    const group = options.find(
                        (o): o is APIApplicationCommandSubcommandGroupOption =>
                            o.name === context.subcommandGroupName &&
                            o.type === ApplicationCommandOptionType.SubcommandGroup &&
                            Array.isArray(o.options)
                    )
                    subOptExists = !!(group && group.options?.find(subOpt => subOpt.name === potentialSubcommand && subOpt.type === ApplicationCommandOptionType.Subcommand))
                } else {
                    subOptExists = !!options.find(o => o.name === potentialSubcommand && o.type === ApplicationCommandOptionType.Subcommand)
                }
                if (subOptExists) {
                    context.subcommandName = commandPathForContext.shift() || null
                }
            }
        }
    }

    private static buildYargsOptions(yargsInstance: Argv, options: Readonly<APIApplicationCommandOption[]>) {
        for (const option of options) {
            const opt = option
            const yargsOptConfig: YargsOptions = {
                describe: opt.description,
                required: opt.required || false,
            }

            if (opt.required) {
                yargsOptConfig.describe = `(Required) ${opt.description}`
            }

            switch (opt.type) {
                case ApplicationCommandOptionType.String:
                    yargsOptConfig.type = 'string'
                    if ('choices' in opt && opt.choices) yargsOptConfig.choices = opt.choices.map((c: { name: string, value: string }) => c.value)
                    break
                case ApplicationCommandOptionType.Integer:
                case ApplicationCommandOptionType.Number:
                    yargsOptConfig.type = 'number'
                    if (opt.type === ApplicationCommandOptionType.Integer) yargsOptConfig.coerce = (arg: string | number) => parseInt(String(arg), 10)
                    if ('choices' in opt && opt.choices) yargsOptConfig.choices = opt.choices.map((c: { name: string, value: number }) => c.value)
                    break
                case ApplicationCommandOptionType.Boolean:
                    yargsOptConfig.type = 'boolean'
                    break
                case ApplicationCommandOptionType.User:
                case ApplicationCommandOptionType.Channel:
                case ApplicationCommandOptionType.Role:
                case ApplicationCommandOptionType.Mentionable:
                    yargsOptConfig.type = 'string'
                    break
                case ApplicationCommandOptionType.Attachment:
                    yargsOptConfig.type = 'boolean'
                    yargsOptConfig.default = false
                    yargsOptConfig.describe = `${opt.description} (Upload file with message when using this flag for text commands.)`
                    if (opt.required) yargsOptConfig.describe = `(Required) ${yargsOptConfig.describe}`
                    break
                default:
                    logger.warn(`{buildYargsOptions} Unsupported option type: ${opt.type} for ${opt.name}`)
                    yargsOptConfig.type = 'string'
            }
            yargsInstance.option(opt.name, yargsOptConfig)
        }
    }

    private static buildYargsParserForCommand(commandDef: SlashCommand, message: Message, rawArgsString: string, prefix: string): Argv<{}> {
        const baseCommandData = commandDef.data.toJSON()
        const parser = yargs(rawArgsString)

        parser
            .scriptName(`${prefix}${baseCommandData.name}`)
            .help('h').alias('h', 'help')
            .version(false)
            .exitProcess(false)
            .recommendCommands()
            .strict()
            .fail(async (msg, err, yargsInstanceItself) => {
                let replyMessage = ''

                if (msg) {
                    replyMessage = msg
                }

                if (err) {
                    if (replyMessage) replyMessage += '\n'
                    replyMessage += `Error: ${err.message}`
                    logger.warn(`{buildYargsParserForCommand} Yargs internal error for ${baseCommandData.name}: ${err.message}`)
                }

                if (!replyMessage) {
                    try {
                        if (yargsInstanceItself && typeof yargsInstanceItself.getHelp === 'function') {
                            replyMessage = await yargsInstanceItself.getHelp()
                        } else {
                            logger.warn(`{buildYargsParserForCommand.fail} yargsInstanceItself.getHelp is not a function for ${baseCommandData.name}. Falling back. Msg: "${msg}", Err: "${err ? err.message : 'N/A'}"`)
                            replyMessage = msg || (err ? `Error: ${err.message}` : 'Invalid command usage. Use --help for more info.')
                        }
                    } catch (getHelpError) {
                        logger.error(`{buildYargsParserForCommand} Failed to generate help string: ${getHelpError}`)
                        replyMessage = 'Invalid command usage. Could not generate help text.'
                    }
                } else {
                    try {
                        if (yargsInstanceItself && typeof yargsInstanceItself.getHelp === 'function') {
                            const fullHelp = await yargsInstanceItself.getHelp()
                            if (fullHelp && !replyMessage.includes(fullHelp.slice(0, Math.min(50, fullHelp.length)))) {
                                replyMessage += `\n\nUsage:\n${fullHelp}`
                            }
                        } else {
                            logger.warn(`{buildYargsParserForCommand} yargsInstanceItself.getHelp is not a function (in else branch) for ${baseCommandData.name}. Cannot append full help.`)
                        }
                    } catch (getHelpError) {
                        logger.warn(`{buildYargsParserForCommand} Could not append full yargs help output: ${getHelpError}`)
                    }
                }

                if (replyMessage.trim()) {
                    const formattedReply = `\`\`\`\n${replyMessage.trim()}\n\`\`\``
                    await message.reply(formattedReply)
                } else {
                    logger.warn(`{buildYargsParserForCommand} Yargs .fail() called with no message and no error for ${baseCommandData.name}.`)
                    await message.reply("An unspecified error occurred with your command input.")
                }
            })

        const topLevelOptions = baseCommandData.options?.filter(
            (opt): opt is APIApplicationCommandOption => opt.type !== ApplicationCommandOptionType.Subcommand &&
                                  opt.type !== ApplicationCommandOptionType.SubcommandGroup
        ) || []

        if (topLevelOptions.length > 0) {
            this.buildYargsOptions(parser, topLevelOptions)
        }

        const subRelatedOptions = baseCommandData.options?.filter(
            (opt): opt is (APIApplicationCommandSubcommandOption | APIApplicationCommandSubcommandGroupOption) => opt.type === ApplicationCommandOptionType.Subcommand ||
                                  opt.type === ApplicationCommandOptionType.SubcommandGroup
        ) || []

        let hasSubcommandsOrGroups = false
        if (subRelatedOptions.length > 0) {
            hasSubcommandsOrGroups = true
            for (const option of subRelatedOptions) {
                const optData = option
                if (optData.type === ApplicationCommandOptionType.Subcommand) {
                    parser.command(
                        optData.name,
                        optData.description,
                        yargsSubcommand => {
                            if (optData.options) this.buildYargsOptions(yargsSubcommand, optData.options)
                            return yargsSubcommand
                        },
                        async _argv => {}
                    )
                } else if (optData.type === ApplicationCommandOptionType.SubcommandGroup) {
                    parser.command(
                        optData.name,
                        optData.description,
                        yargsGroup => {
                            if (optData.options && Array.isArray(optData.options)) {
                                for (const subCmdOpt of optData.options) {
                                    if (subCmdOpt.type === ApplicationCommandOptionType.Subcommand) {
                                        yargsGroup.command(
                                            subCmdOpt.name, subCmdOpt.description,
                                            yargsSubcommand => {
                                                if (subCmdOpt.options) this.buildYargsOptions(yargsSubcommand, subCmdOpt.options)
                                                return yargsSubcommand
                                            },
                                            async _argv => {}
                                        )
                                    }
                                }
                            }
                            yargsGroup.demandCommand(1, `You need to specify a subcommand for '${optData.name}'.`)
                            return yargsGroup
                        },
                        async _argv => {}
                    )
                }
            }
        }

        if (hasSubcommandsOrGroups && topLevelOptions.length === 0) {
            parser.demandCommand(
                1,
                `This command requires a subcommand. Use --help for options.`
            )
        }
        return parser
    }

    private static tokenizeArgs(str: string): string[] {
        const tokens: string[] = []
        const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g
        let match
        while ((match = regex.exec(str))) {
            tokens.push(match[1] ?? match[2] ?? match[0])
        }
        return tokens
    }
}
