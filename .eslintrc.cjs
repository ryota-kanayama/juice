module.exports = {
  root: true,
  extends: ['@electron-toolkit/eslint-config-ts/recommended'],
  ignorePatterns: [
    'node_modules',
    'out',
    'dist',
    'dist-electron',
    'dist-release',
    'release',
    'docs',
    'coverage',
    '*.config.ts',
    '*.config.js',
    '.eslintrc.cjs',
  ],
  rules: {
    // 未使用変数の検出。アンダースコア接頭辞は意図的な未使用として許容。
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
    ],
    // any は警告にとどめる（戦略的に許容するケースのため）
    '@typescript-eslint/no-explicit-any': 'warn',
    // require() は許容する
    '@typescript-eslint/no-var-requires': 'off',
    // 戻り値型の明示は要求しない（TypeScript の推論に任せる）。
    // 内部の小さな arrow 関数まで書かせると冗長になるため。
    '@typescript-eslint/explicit-function-return-type': 'off',
  },
}
