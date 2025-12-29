export const languages = ['latin', 'cyrillic', 'greek'] as const
export type LanguageType = typeof languages[number]

// Shared Morse code mappings
const COMMON_MAP = {
    '1': '.----', '2': '..---', '3': '...--', '4': '....-', '5': '.....',
    '6': '-....', '7': '--...', '8': '---..', '9': '----.', '0': '-----',
    ',': '--..--', '.': '.-.-.-', '?': '..--..', ';': '-.-.-', ':': '---...',
    '/': '-..-.', '-': '-....-', "'": '.----.', '(': '-.--.-', ')': '-.--.-',
    '_': '..--.-', '@': '.--.-.', ' ': '/'
} as const

const ENCODE_MAPS: Record<LanguageType, Record<string, string>> = {
    latin: {
        ...COMMON_MAP,
        'A': '.-', 'B': '-...', 'C': '-.-.', 'D': '-..', 'E': '.', 'F': '..-.',
        'G': '--.', 'H': '....', 'I': '..', 'J': '.---', 'K': '-.-', 'L': '.-..',
        'M': '--', 'N': '-.', 'O': '---', 'P': '.--.', 'Q': '--.-', 'R': '.-.',
        'S': '...', 'T': '-', 'U': '..-', 'V': '...-', 'W': '.--', 'X': '-..-',
        'Y': '-.--', 'Z': '--..',
        // ITU-R M.1677-1 additions for European accented characters
        'Ä': '.-.-', 'Æ': '.-.-', 'Á': '.--.-', 'Å': '.--.-', 'À': '.--.-',
        'Ç': '-.-..', 'É': '..-..', 'Ð': '..-..', 'È': '.-..-', 'Ñ': '--.--',
        'Ö': '---.', 'Ø': '---.', 'Ü': '..--', 'Þ': '.--..'
    },
    cyrillic: {
        ...COMMON_MAP,
        'А': '.-', 'Б': '-...', 'В': '.--', 'Г': '--.', 'Д': '-..', 'Е': '.',
        'Ё': '.', 'Ж': '...-', 'З': '--..', 'И': '..', 'Й': '.---', 'К': '-.-',
        'Л': '.-..', 'М': '--', 'Н': '-.', 'О': '---', 'П': '.--.', 'Р': '.-.',
        'С': '...', 'Т': '-', 'У': '..-', 'Ф': '..-.', 'Х': '....', 'Ц': '-.-.',
        'Ч': '---.', 'Ш': '----', 'Щ': '--.-', 'Ъ': '--.--', 'Ы': '-.--',
        'Ь': '-..-', 'Э': '..-..', 'Ю': '..--', 'Я': '.-.-'
    },
    greek: {
        ...COMMON_MAP,
        'Α': '.-', 'Β': '-...', 'Γ': '--.', 'Δ': '-..', 'Ε': '.',
        'Ζ': '--..', 'Η': '....', 'Θ': '-.-.', 'Ι': '..', 'Κ': '-.-',
        'Λ': '.-..', 'Μ': '--', 'Ν': '-.', 'Ξ': '-..-', 'Ο': '---',
        'Π': '.--.', 'Ρ': '.-.', 'Σ': '...', 'Τ': '-', 'Υ': '.-..-',
        'Φ': '..-.', 'Χ': '----', 'Ψ': '--.-', 'Ω': '.--'
    }
}

const DECODE_MAPS: Record<LanguageType, Map<string, string>> = {
    latin: new Map(Object.entries(ENCODE_MAPS.latin).map(([char, code]) => [code, char])),
    cyrillic: new Map(Object.entries(ENCODE_MAPS.cyrillic).map(([char, code]) => [code, char])),
    greek: new Map(Object.entries(ENCODE_MAPS.greek).map(([char, code]) => [code, char]))
}

/**
 * Encodes text to Morse.
 */
export function encode(text: string, language: LanguageType = 'latin'): string {
    const map = ENCODE_MAPS[language]
    return text
        .toUpperCase()
        .trim()
        .replace(/\s+/g, ' ') // Collapse multiple spaces into one
        .split('')
        .map(char => map[char] ?? '?')
        .join(' ')
}

/**
 * Decodes Morse to text.
 */
export function decode(morse: string, language: LanguageType = 'latin'): string {
    const map = DECODE_MAPS[language]
    return morse
        .trim()
        .split(/\s+/) // Splits by any amount of whitespace
        .map(code => map.get(code) ?? '?')
        .join('')
}
