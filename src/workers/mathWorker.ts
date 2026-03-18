import type { ExplicitAny } from '../types'
import { create, all } from 'mathjs'

const math = create(all)
const limitedEvaluate = math.evaluate

try {
    math.createUnit(
        {
            embil: {
                baseName: 'length',
                definition: '165 cm',
                aliases: ['embi_length', 'embi_height']
            },
            embim: {
                baseName: 'mass',
                definition: '50 kg',
                aliases: ['embi_weight', 'embi_mass']
            },
            ly: {
                baseName: 'length',
                definition: '9460730472580.8 km',
                aliases: ['light_year']
            },
            au: {
                baseName: 'length',
                definition: '149597870.69 km',
                aliases: ['astronomical_unit']
            },
            c0: {
                baseName: 'length',
                definition: '299792458 m/s',
                aliases: ['light_speed']
            }
        },
        { override: true, prefixes: 'long' }
    )
} catch (e) {
    console.error(`Error initializing Math.js units: ${e}`)
}

math.import(
    {
        import: function () {
            throw new Error('Function import is disabled')
        },
        createUnit: function () {
            throw new Error('Function createUnit is disabled')
        },
        reviver: function () {
            throw new Error('Function reviver is disabled')
        }
    },
    { override: true }
)

function toFeetInches(value: ExplicitAny): `${number}'${number}` {
    const inches = math.unit(value).toNumber('inch')
    const feet = Math.floor(inches / 12)
    const remainingInches = inches % 12
    return `${feet}'${remainingInches}`
}

self.onmessage = (event: MessageEvent) => {
    try {
        const expression = event.data

        const result = limitedEvaluate(expression, { toFeetInches })

        let resultString = ''
        if (
            (typeof result === 'object' || typeof result === 'function') &&
            result !== null &&
            result.toString
        ) {
            resultString = result.toString()
        } else {
            resultString = String(result)
        }

        if (expression.replace(/\s+/g, '') === '9+10') {
            resultString = '21'
        }

        if (resultString.length > 1900) {
            resultString =
                resultString.substring(0, 1900) + '... (result truncated)'
        }

        postMessage({ success: true, result: resultString })
    } catch (error) {
        postMessage({ success: false, error: (error as Error).message })
    }
}
