import { configBase } from './packages/config/src/eslint.js';

export default [
  ...configBase,
  {
    // Scripts de manutenção rodam em Node puro, fora do projeto TypeScript.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
      },
    },
  },
];
