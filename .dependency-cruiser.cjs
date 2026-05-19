// 層境界の強制。違反は CI / npm run depcruise でエラーになる。
// レイヤ依存方向:
//   components → hooks → { domain, repositories }
//   domain は何にも依存しない（純粋）
//   repositories は domain と shared/types/ipc のみ参照可
//   shared は renderer/main から独立
//
// dailyStore.ts はレンダラ内のローカルストレージラッパで、現状フックから
// 直接利用するため hooks 層と同列に扱う（components から直接呼ばない）。

module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: '循環依存を禁止する',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: '孤立ファイル（どこからも import されない）を検出する',
      from: {
        orphan: true,
        pathNot: [
          '(^|/)\\.[^/]+\\.(js|cjs|mjs|ts|json)$', // ドットファイル
          '\\.d\\.ts$',
          '(^|/)tsconfig\\.json$',
          '(^|/)(babel|webpack)\\.config\\.(js|cjs|mjs|ts|json)$',
          '/main\\.tsx$',
          '/main/index\\.ts$',
          '/preload/index\\.ts$',
          '/electron\\.vite\\.config\\.ts$',
        ],
      },
      to: {},
    },

    // ── レンダラ層境界 ───────────────────────────────────────────

    {
      name: 'components-cannot-touch-repositories',
      severity: 'error',
      comment: 'presentation 層は data-access を直接触らない。hooks 経由で。',
      from: { path: '^src/renderer/src/components/' },
      to: { path: '^src/renderer/src/repositories/' },
    },
    {
      name: 'components-cannot-touch-electron-api',
      severity: 'error',
      comment: 'presentation 層から window.electronAPI を直接叩かない（repository を経由）。',
      from: { path: '^src/renderer/src/components/' },
      to: { path: '^src/preload/' },
    },
    {
      name: 'domain-must-be-pure',
      severity: 'error',
      comment: 'domain は React・hooks・repositories・dailyStore に依存しない。',
      from: { path: '^src/renderer/src/domain/' },
      to: {
        path: [
          '^src/renderer/src/(components|hooks|repositories)/',
          '^src/renderer/src/dailyStore\\.ts$',
          '^react$',
          '^react-dom',
        ],
      },
    },
    {
      name: 'repositories-must-not-depend-on-app',
      severity: 'error',
      comment: 'repositories は components / hooks / domain / dailyStore に依存しない。',
      from: { path: '^src/renderer/src/repositories/' },
      to: {
        path: [
          '^src/renderer/src/(components|hooks|domain)/',
          '^src/renderer/src/dailyStore\\.ts$',
        ],
      },
    },
    {
      name: 'hooks-cannot-touch-components',
      severity: 'error',
      comment: 'hooks は presentation を import しない（依存方向を一方向に保つ）。',
      from: { path: '^src/renderer/src/hooks/' },
      to: { path: '^src/renderer/src/components/' },
    },
    {
      name: 'shared-must-be-isolated',
      severity: 'error',
      comment: 'shared は renderer/main の実装に依存しない。',
      from: { path: '^src/shared/' },
      to: { path: '^src/(renderer|main|preload)/' },
    },

    // ── main プロセス境界 ─────────────────────────────────────────

    {
      name: 'main-no-renderer',
      severity: 'error',
      comment: 'main プロセスは renderer のソースに依存しない（shared 経由のみ）。',
      from: { path: '^src/main/' },
      to: { path: '^src/renderer/' },
    },
    {
      name: 'renderer-no-main',
      severity: 'error',
      comment: 'renderer は main のソースに依存しない（shared 経由のみ）。',
      from: { path: '^src/renderer/' },
      to: { path: '^src/main/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '\\.test\\.(ts|tsx)$' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
}
