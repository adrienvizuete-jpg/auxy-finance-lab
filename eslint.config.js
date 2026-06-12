/**
 * Auxy Finance Lab — configuration ESLint (flat config, ESLint 9)
 * Cible : erreurs de correction (variables non définies/inutilisées,
 * comparaisons lâches, var) — le style reste libre.
 */

import js from '@eslint/js';
import globals from 'globals';

export default [
    js.configs.recommended,

    // Code applicatif (navigateur, modules ES)
    {
        files: ['js/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                // Bibliothèques chargées par CDN (globals)
                Chart: 'readonly',
                XLSX: 'readonly',
                docx: 'readonly',
                jspdf: 'readonly'
            }
        },
        rules: {
            'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
            eqeqeq: ['error', 'smart'],
            'no-var': 'error',
            'prefer-const': 'error'
        }
    },

    // Service worker
    {
        files: ['sw.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            globals: { ...globals.serviceworker }
        },
        rules: {
            'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
            eqeqeq: ['error', 'smart'],
            'no-var': 'error',
            'prefer-const': 'error'
        }
    },

    // Tests unitaires et E2E (Node)
    {
        files: ['tests/**/*.mjs', 'e2e/**/*.mjs'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.node,
                // Les callbacks page.evaluate() s'exécutent dans le navigateur
                document: 'readonly',
                navigator: 'readonly',
                location: 'readonly',
                window: 'readonly'
            }
        },
        rules: {
            'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
            eqeqeq: ['error', 'smart'],
            'no-var': 'error',
            'prefer-const': 'error'
        }
    },

    {
        ignores: ['node_modules/**', 'assets/**', 'data/**', 'docs/**']
    }
];
