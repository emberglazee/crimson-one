import { Logger, yellow } from '../util/logger'
const logger = new Logger('ModeManager')

import fs from 'fs/promises'
import path from 'path'

type ActiveMode = 'crimsonchat' | 'shapesinc'

interface State {
    activeMode: ActiveMode
    shapesIncSolo: boolean
}

export class ModeManager {
    private static instance: ModeManager
    private state: State = {
        activeMode: 'crimsonchat', // default
        shapesIncSolo: false
    }
    private statePath = path.join(process.cwd(), 'data/mode_state.json')

    public static getInstance(): ModeManager {
        if (!ModeManager.instance) {
            ModeManager.instance = new ModeManager()
        }
        return ModeManager.instance
    }

    public async init() {
        try {
            const data = await fs.readFile(this.statePath, 'utf-8')
            this.state = JSON.parse(data)
            logger.ok(`Loaded mode state, active mode is ${yellow(this.state.activeMode)}`)
        } catch {
            logger.info('No existing mode state file found, saving default state.')
            await this.saveState()
        }
    }

    private async saveState() {
        await fs.mkdir(path.dirname(this.statePath), { recursive: true })
        await fs.writeFile(this.statePath, JSON.stringify(this.state, null, 2))
    }

    public getActiveMode(): ActiveMode {
        return this.state.activeMode
    }

    public async setActiveMode(mode: ActiveMode) {
        this.state.activeMode = mode
        if (mode === 'shapesinc') {
            this.state.shapesIncSolo = true
        } else {
            this.state.shapesIncSolo = false
        }
        await this.saveState()
    }

    public isShapesIncSolo(): boolean {
        return this.state.activeMode === 'shapesinc' && this.state.shapesIncSolo
    }

    public async setShapesIncSolo(solo: boolean) {
        if (this.state.activeMode !== 'shapesinc' && solo) {
            throw new Error('Cannot enable ShapesInc solo mode when it is not the active mode.')
        }
        this.state.shapesIncSolo = solo
        await this.saveState()
    }
}
