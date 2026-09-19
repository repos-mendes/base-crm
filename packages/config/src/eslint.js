import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

/**
 * Configuração de ESLint compartilhada pelo monorepo.
 *
 * O produto vive de invariantes que só o tipo garante (RLS, policy engine,
 * eventos append-only), então as regras tipadas ficam ligadas e `any` implícito
 * é erro, não aviso.
 */
export const configBase = tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.open-next/**',
      '**/.turbo/**',
      '**/.wrangler/**',
      '**/coverage/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      // Uma promise esquecida aqui vira evento perdido ou escrita fora de
      // transação; não é estilo.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      // Importação só de tipo deve dizer que é de tipo: o bundler do Worker
      // depende disso para não arrastar módulo de servidor para o cliente.
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    ...tseslint.configs.disableTypeChecked,
  },
  prettier,
);

export default configBase;
