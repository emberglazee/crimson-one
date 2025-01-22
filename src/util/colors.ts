export type ColorName = 'Gray' | 'Red' | 'Green' | 'Yellow' | 'Blue' | 'Pink' | 'Cyan' |
    'White' | 'Orange' | 'Purple' | 'Brown' | 'Lime' | 'Teal' | 'Navy' |
    'Peacekeeper Red' | 'Faust/Goblin Green' | 'The Home Depot Orange' | 'FakeDev Orange' |
    'Wikiyellow' | 'Federation Blue' | 'Cascadian Teal' | 'Mercenary Yellow' |
    'PWcord Moderator Turquoise' | 'Voice Actor Blue' | 'Mugged Pink' | 'Potato Brown' | '⭐ Yellow' |
    'Priority Red' | 'Ridel Purple' | 'OG Member Orange'

export interface ColorDefinition {
    name: ColorName
    hex: string
}

export const COLORS: ColorDefinition[] = [
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
export const ROLE_COLORS: ColorDefinition[] = [
    { name: 'Peacekeeper Red', hex: '#992D22' },
    { name: 'Faust/Goblin Green', hex: '#1F8b4C' },
    { name: 'The Home Depot Orange', hex: '#F96302' },
    { name: 'FakeDev Orange', hex: '#E67E22' },
    { name: 'Wikiyellow', hex: '#FFB40B' },
    { name: 'Federation Blue', hex: '#0C0D3B' },
    { name: 'Cascadian Teal', hex: '#2BBCC2' },
    { name: 'Mercenary Yellow', hex: '#BBAD2C' },
    { name: 'PWcord Moderator Turquoise', hex: '#1ABC9C' },
    { name: 'Voice Actor Blue', hex: '#86A4C7' },
    { name: 'Mugged Pink', hex: '#FFABF3' },
    { name: 'Potato Brown', hex: '#c8a186' },
    { name: '⭐ Yellow', hex: '#fdb401' },
    { name: 'Priority Red', hex: '#FF0000' },
    { name: 'Ridel Purple', hex: '#71368A' }
]

export type GradientType = 'none' | 'trans' | 'rainbow'

export const TRANS_COLORS = ['#55CDFC', '#F7A8B8', '#FFFFFF', '#F7A8B8', '#55CDFC']
export const RAINBOW_COLORS = ['#FF0000', '#FFA500', '#FFFF00', '#00FF00', '#0000FF', '#4B0082', '#9400D3']
