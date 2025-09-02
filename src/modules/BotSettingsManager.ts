import { singleton } from 'tsyringe'

@singleton()
export class BotSettingsManager {
    private _debugMode = false

    public toggleDebugMode(): boolean {
        this._debugMode = !this._debugMode
        return this._debugMode
    }

    public isDebugModeEnabled(): boolean {
        return this._debugMode
    }
}
