/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  settings: { react: { version: '18.3' } },
  plugins: ['@typescript-eslint', 'react', 'react-hooks', 'react-refresh', 'jsx-a11y'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
    'plugin:jsx-a11y/recommended',
    'prettier',
  ],
  ignorePatterns: ['dist', 'node_modules', 'coverage', '*.config.js', '**/prisma/migrations/**'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/consistent-type-imports': 'error',
    'react/prop-types': 'off',
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    'no-console': ['warn', { allow: ['warn', 'error'] }],
  },
  overrides: [
    {
      files: ['**/*.test.ts', '**/*.test.tsx', '**/src/test/**'],
      rules: { 'react-refresh/only-export-components': 'off' },
    },
    {
      // Engine must stay runtime-agnostic: no browser globals, no clock, no Math.random.
      files: ['packages/engine/src/**/*.ts'],
      excludedFiles: ['**/*.test.ts'],
      env: { browser: false, node: false },
      rules: {
        'no-restricted-globals': [
          'error',
          'window',
          'document',
          'localStorage',
          'sessionStorage',
          'navigator',
        ],
        'no-restricted-properties': [
          'error',
          { object: 'Date', property: 'now', message: 'Pass time in as a parameter.' },
          { object: 'Math', property: 'random', message: 'Use SeededRandom.' },
        ],
      },
    },
    {
      files: ['**/scripts/**/*.mjs', 'apps/api/prisma/seed.ts'],
      rules: { 'no-console': 'off' },
    },
  ],
};
