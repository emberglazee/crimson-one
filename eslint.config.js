import path from 'node:path'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import stylistic from '@stylistic/eslint-plugin'

export default tseslint.config({
    ...tseslint.configs.recommended[0],
    files: ['**/*.{js,mjs,cjs,ts}'],
    languageOptions: {
        globals: globals.commonjs,
        parserOptions: {
            project: './tsconfig.json',
            tsconfigRootDir: path.resolve(),
            ecmaVersion: 'latest',
            sourceType: 'module' // Bun
        },
        parser: tseslint.parser
    },
    plugins: {
        '@stylistic': stylistic,
        '@typescript-eslint': tseslint.plugin
    },
    rules: {
        'no-trailing-spaces': 'error',
        'eol-last': 'error',
        '@stylistic/semi': ['error', 'never'],
        'no-async-promise-executor': 'off',
        'no-case-declarations': 'off',
        '@typescript-eslint/no-empty-object-type': 'off',
        '@typescript-eslint/no-unused-vars': ['error', {
            argsIgnorePattern: '^_',
            varsIgnorePattern: '^_'
        }],
        '@typescript-eslint/no-unused-expressions': 'off',
        'arrow-parens': ['error', 'as-needed'],
        'comma-dangle': ['error', 'never'],
        '@stylistic/member-delimiter-style': ['error', {
            multiline: {
                delimiter: 'none',
                requireLast: false
            },
            singleline: {
                delimiter: 'comma',
                requireLast: false
            }
        }],
        '@stylistic/space-infix-ops': ['error'],
        'space-before-function-paren': ['error', {
            anonymous: 'always',
            named: 'never',
            asyncArrow: 'always'
        }],
        'quotes': [
            'error', 'single',
            { avoidEscape: true }
        ]
    }
})
