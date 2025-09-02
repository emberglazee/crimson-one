import type { HexColorString } from 'discord.js'

type BasicSubtitleColorDefinition = {
    name: string
    hex: HexColorString
}

const basicSubtitleColors: BasicSubtitleColorDefinition[] = [
    { name: 'Red', hex: '#FF5555' },
    { name: 'Orange', hex: '#FFA500' },
    { name: 'Yellow', hex: '#FFFF55' },
    { name: 'Lime', hex: '#32CD32' },
    { name: 'Green', hex: '#55FF55' },
    { name: 'Cyan', hex: '#55FFFF' },
    { name: 'Blue', hex: '#5555FF' },
    { name: 'Navy', hex: '#000080' },
    { name: 'Purple', hex: '#8A2BE2' },
    { name: 'Pink', hex: '#FF55FF' },
    { name: 'Brown', hex: '#A52A2A' },
    { name: 'Teal', hex: '#008080' },
    { name: 'Gray', hex: '#B0B0B0' },
    { name: 'White', hex: '#FFFFFF' }
]

const basicSubtitleRoleColors: BasicSubtitleColorDefinition[] = [
    { name: 'Priority Red', hex: '#FF0000' },
    { name: 'Hostile Red', hex:'#e74c3c' },
    { name: 'Peacekeeper Red', hex: '#992D22' },
    { name: 'The Home Depot Orange', hex: '#F96302' },
    { name: 'FakeDev Orange', hex: '#E67E22' },
    { name: '⭐ Yellow', hex: '#fdb401' },
    { name: 'Mad Yellow', hex: '#f1c40f' },
    { name: 'Wikiyellow', hex: '#FFB40B' },
    { name: 'Mercenary Yellow', hex: '#BBAD2C' },
    { name: 'Faust/Goblin Green', hex: '#1F8b4C' },
    { name: 'PWcord Moderator Turquoise', hex: '#1ABC9C' },
    { name: 'Cascadian Teal', hex: '#2BBCC2' },
    { name: 'Voice Actor Blue', hex: '#86A4C7' },
    { name: 'Friendly Blue', hex: '#3498db' },
    { name: 'Federation Dark Blue', hex: '#0C0D3B' },
    { name: 'Ridel Purple', hex: '#71368A' },
    { name: 'Gremlin Pink', hex: '#ff00dc' },
    { name: 'Mugged Pink', hex: '#FFABF3' },
    { name: 'Potato Brown', hex: '#c8a186' }
]

const basicSubtitleCharacterColors: BasicSubtitleColorDefinition[] = [
    { name: 'Ikuyo Red', hex: '#d8615d' },
    { name: 'Nijika Yellow', hex: '#f8dc88' },
    { name: 'Bocchi Pink', hex: '#f5b2c4' },
    { name: 'Kikuri Pink', hex: '#8e577a' },
    { name: 'Ryo Blue', hex: '#5378af' }
]

export type SubtitleColorName = typeof basicSubtitleColors[number]['name'] | typeof basicSubtitleRoleColors[number]['name'] | typeof basicSubtitleCharacterColors[number]['name']

export interface SubtitleColorDefinition {
    name: SubtitleColorName
    hex: HexColorString
}

export const SUBTITLE_COLORS = basicSubtitleColors as SubtitleColorDefinition[]
export const SUBTITLE_ROLE_COLORS = basicSubtitleRoleColors as SubtitleColorDefinition[]
export const SUBTITLE_CHARACTER_COLORS = basicSubtitleCharacterColors as SubtitleColorDefinition[]

export type SubtitleGradientType = 'none' | 'trans' | 'rainbow' | 'italian'

export const SUBTITLE_GRADIENTS = {
    TRANS_COLORS: ['#55CDFC', '#F7A8B8', '#FFFFFF', '#F7A8B8', '#55CDFC'],
    RAINBOW_COLORS: ['#FF0000', '#FFA500', '#FFFF00', '#00FF00', '#0000FF', '#4B0082', '#9400D3'],
    ITALIAN_COLORS: ['#009246', '#FFFFFF', '#CE2B37'],
    FRENCH_COLORS: ['#0055A4', '#FFFFFF', '#EF4135']
}

// Chalk color exports
import chalk from 'chalk'
export const { yellow, red, cyan, green, blue } = chalk
// Forcibly enable chalk colors
chalk.level = 2
