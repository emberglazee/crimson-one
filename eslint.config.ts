import path from 'node:path'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import stylistic from '@stylistic/eslint-plugin'
import eslint from '@eslint/js'
import { defineConfig } from 'eslint/config'

export default defineConfig([
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['src/**/*.{js,mjs,cjs,ts}'],
        languageOptions: {
            globals: {
                ...globals.bunBuiltin
            },
            parserOptions: {
                project: './tsconfig.json',
                tsconfigRootDir: path.resolve(),
                ecmaVersion: 'latest',
                sourceType: 'module'
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
    }
])
