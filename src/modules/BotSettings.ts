export class BotSettingsManager {
    private static instance: BotSettingsManager
    private _debugMode = false

    private constructor() {}

    public static getInstance(): BotSettingsManager {
        if (!BotSettingsManager.instance) {
            BotSettingsManager.instance = new BotSettingsManager()
        }
        return BotSettingsManager.instance
    }

    public toggleDebugMode(): boolean {
        this._debugMode = !this._debugMode
        return this._debugMode
    }

    public isDebugModeEnabled(): boolean {
        return this._debugMode
    }
}

export const botSettings = BotSettingsManager.getInstance()
