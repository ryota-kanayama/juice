/* Tauri + React + TypeScript 向けの ESLint 設定（Electron 移行後）。
   スタイル寄りの指摘は warn に留め、フックの規則違反など実害のあるものを error にする。 */
module.exports = {
  root: true,
  env: { browser: true, es2021: true, node: true },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint', 'react-hooks', 'react-refresh'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  ignorePatterns: [
    'dist',
    'src-tauri',
    'node_modules',
    'lambda/dist',
    'lambda/terraform',
    '**/*.cjs',
    '**/*.config.ts',
    'frontend/renderer/src/components/ui/**',
  ],
  rules: {
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    // 空関数はテストのモックや no-op デフォルトコールバックとして意図的に多用するため無効化
    '@typescript-eslint/no-empty-function': 'off',
  },
}
