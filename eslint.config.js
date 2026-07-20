import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import importX from 'eslint-plugin-import-x';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/.turbo/**', '**/node_modules/**', '**/*.d.ts'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'import-x': importX,
    },
    settings: {
      'import-x/resolver': {
        node: true,
      },
    },
    rules: {
      'import-x/no-cycle': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/packages/*/src/**',
                '**/packages/*/dist/**',
                '**/apps/*/src/**',
                '**/apps/*/dist/**',
              ],
              message:
                'Import other Agentform workspace packages via their package name (@agentform/*), not a relative path.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: globals.node,
    },
  },
  prettierConfig,
);
