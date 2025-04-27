import type { HexColor } from '../types/types'

type BasicColorDefinition = {
    name: string
    hex: HexColor
}

const basicColors: BasicColorDefinition[] = [
    { name: 'Gray', hex: '#B0B0B0' },
    { name: 'Red', hex: '#FF5555' },
    { name: 'Green', hex: '#55FF55' },
    { name: 'Yellow', hex: '#FFFF55' },
    { name: 'Blue', hex: '#5555FF' },
    { name: 'Pink', hex: '#FF55FF' },
    { name: 'Cyan', hex: '#55FFFF' },
    { name: 'White', hex: '#FFFFFF' },
    { name: 'Orange', hex: '#FFA500' },
    { name: 'Purple', hex: '#8A2BE2' },
    { name: 'Brown', hex: '#A52A2A' },
    { name: 'Lime', hex: '#32CD32' },
    { name: 'Teal', hex: '#008080' },
    { name: 'Navy', hex: '#000080' }
]

const basicRoleColors: BasicColorDefinition[] = [
    { name: 'Peacekeeper Red', hex: '#992D22' },
    { name: 'Priority Red', hex: '#FF0000' },
    { name: 'Hostile Red', hex:'#e74c3c' },
    { name: 'The Home Depot Orange', hex: '#F96302' },
    { name: 'FakeDev Orange', hex: '#E67E22' },
    { name: 'Wikiyellow', hex: '#FFB40B' },
    { name: 'Mad Yellow', hex: '#f1c40f' },
    { name: '⭐ Yellow', hex: '#fdb401' },
    { name: 'Mercenary Yellow', hex: '#BBAD2C' },
    { name: 'Federation Dark Blue', hex: '#0C0D3B' },
    { name: 'Friendly Blue', hex: '#3498db' },
    { name: 'Voice Actor Blue', hex: '#86A4C7' },
    { name: 'Cascadian Teal', hex: '#2BBCC2' },
    { name: 'PWcord Moderator Turquoise', hex: '#1ABC9C' },
    { name: 'Faust/Goblin Green', hex: '#1F8b4C' },
    { name: 'Mugged Pink', hex: '#FFABF3' },
    { name: 'Gremlin Pink', hex: '#ff00dc' },
    { name: 'Ridel Purple', hex: '#71368A' },
    { name: 'Potato Brown', hex: '#c8a186' },
]

const basicCharacterColors: BasicColorDefinition[] = [
    { name: 'Bocchi Pink', hex: '#f5b2c4' },
    { name: 'Nijika Yellow', hex: '#f8dc88' },
    { name: 'Ikuyo Red', hex: '#d8615d' },
    { name: 'Ryo Blue', hex: '#5378af' }
]

export type ColorName = typeof basicColors[number]['name'] | typeof basicRoleColors[number]['name'] | typeof basicCharacterColors[number]['name']

export interface ColorDefinition {
    name: ColorName
    hex: HexColor
}

export const COLORS = basicColors as ColorDefinition[]
export const ROLE_COLORS = basicRoleColors as ColorDefinition[]
export const CHARACTER_COLORS = basicCharacterColors as ColorDefinition[]

export type GradientType = 'none' | 'trans' | 'rainbow' | 'italian'

export const TRANS_COLORS = ['#55CDFC', '#F7A8B8', '#FFFFFF', '#F7A8B8', '#55CDFC']
export const RAINBOW_COLORS = ['#FF0000', '#FFA500', '#FFFF00', '#00FF00', '#0000FF', '#4B0082', '#9400D3']
export const ITALIAN_COLORS = ['#009246', '#FFFFFF', '#CE2B37']
export const FRENCH_COLORS = ['#0055A4', '#FFFFFF', '#EF4135']
