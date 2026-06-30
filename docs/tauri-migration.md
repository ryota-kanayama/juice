# Tauri 移行ドキュメント

Juice Timer（Electron + React）を **Tauri v2** へ移行するための調査・PoC 記録と作業計画。
軽量化（バンドル & 常駐メモリの削減）が主目的。

## なぜ移行するか

本番 `Juice.app`（アイドル・ポップオーバー閉）の実メモリ（`phys_footprint`）：

| プロセス | 役割 | 実メモリ |
| --- | --- | --- |
| メインプロセス（Browser） | — | 94 MB |
| Juice Helper（GPU） | — | 71 MB |
| Juice Helper（Renderer） | ポップオーバー UI | 59 MB |
| Juice Helper（Network） | — | 7 MB |
| **合計** | | **≈ 231 MB** |

合計の半分以上（GPU 71 + Renderer 59 = 130MB）が Chromium 由来。メニューバー常駐タイマーには過大。
Tauri は WebKit をシステム共有し GPU/Network 独立プロセスも消えるため、**常駐メモリ 1/3〜1/4** が見込める
（PoC の dev ビルドでメインプロセス実測 **27MB**）。

## PoC 結果（`poc/`）— 移行は 🟢 GO

最大リスクだった「メニューバー常駐 + 非アクティベート NSPanel」を実機検証し、**全項目クリア**：

| 検証項目 | 結果 |
| --- | --- |
| 非アクティベート NSPanel（他アプリのフォーカスを奪わない） | ✅ |
| blur で自動クローズ | ✅ |
| パネル内キーボード入力（日本語 IME 含む） | ✅ |
| Dock 非表示（メニューバー専用） | ✅ |
| トレイ下への配置（単一ディスプレイ） | ✅ |
| マルチモニタ（Retina + 外部の混在 DPI）配置 | ✅（ネイティブ回避策） |

PoC は `poc/`（`npm create tauri-app` の vanilla-ts ベース）。`poc/src-tauri/src/lib.rs` に
トレイ・パネル・配置ロジックがまとまっている。

## ⚠️ 移行で必ず効いてくる落とし穴（PoC で判明）

### 1. パネルの位置指定は「ネイティブ AppKit 直叩き」が必須

**Tauri 標準の `set_position` / `tauri-plugin-positioner` は macOS マルチモニタで機能しない**
（`Ok` を返すのにウィンドウが動かない／常にプライマリに出る）。これは Tauri 上流の未修正バグ：

- [tauri-apps/tauri#7890](https://github.com/tauri-apps/tauri/issues/7890) — macOS でモニタ位置は scaled・サイズは unscaled で報告され座標が矛盾（OPEN）
- [tauri-apps/tauri#7139](https://github.com/tauri-apps/tauri/issues/7139) — トレイクリック時にモニタ間でウィンドウ位置を設定できない（OPEN）

**回避策**：`tauri-nspanel` が握る生 `NSPanel` ハンドルに AppKit を直接叩く。
`NSEvent.mouseLocation`（Cocoa の一貫したグローバル座標）→ カーソルが居る `NSScreen.visibleFrame`
→ `setFrameOrigin:` で配置する。Cocoa の座標系は一貫しているため両ディスプレイで正しく動く。
実装は `poc/src-tauri/src/lib.rs` の `position_native()` を参照。

→ **原則：Juice の panel 位置制御は Tauri API を使わず必ずネイティブ経由で実装する。**

### 2. 非アクティベート NSPanel は `tauri-nspanel`（非公式クレート）依存

- 依存：`tauri-nspanel = { git = "https://github.com/ahkohd/tauri-nspanel", branch = "v2" }`
- キモの設定（`lib.rs` の `init_panel`）：
  - `set_style_mask(NSWindowStyleMaskNonActivatingPanel)` … アプリをアクティブにせず表示
  - `set_collection_behaviour(MoveToActiveSpace | FullScreenAuxiliary)` … 現在 Space に移動、全 Space 常駐は避ける
  - `panel_delegate!` の `window_did_resign_key` で `order_out` … blur-to-close
- コミュニティ製のため、Tauri 本体のバージョンアップで追従が必要になりうる。

### 3. 透明ウィンドウには `macos-private-api` feature が必須

`tauri.conf.json` の `app.macOSPrivateApi: true` と、`Cargo.toml` の
`tauri = { features = ["macos-private-api", "tray-icon"] }` をセットで入れる
（片方だけだとビルドが「allowlist 不一致」で失敗する）。

### 4. すりガラス（vibrancy）は未対応

現状の PoC は CSS `backdrop-filter` のみで、背後の他アプリまではぼかせない。
本物の vibrancy が必要なら `NSVisualEffectView` のネイティブ対応が別途必要（優先度低）。

### 5. セキュリティ（コミット時レビュー指摘 → 対応済み／要継続）

- **git 依存はピン留め必須**：`tauri-nspanel` は branch 追従だと改ざん・破壊的変更を自動で取り込むため、
  特定 rev（`18ffb9a…`）に固定済み。更新時は rev を意図的に上げて差分を確認する。
- **CSP**：scaffold 既定の `csp: null` は XSS ハードニング無効。PoC はローカル限定 inline を許可した
  暫定 CSP に変更済み。**本番移行では Vite ビルド済み renderer を使い `'unsafe-inline'` を外す**こと。
- 認証トークンは `safeStorage`→`keyring`（Keychain）で OS 暗号化を維持する（移植マップ参照）。

## メインプロセス移植マップ（Electron → Rust）

Renderer（`src/renderer/`）は React のまま流用可能。重いのは `src/main/` の Rust 化。

| 領域 | 現行ファイル | Tauri 側 | 工数 | リスク |
| --- | --- | --- | --- | --- |
| データストア | `sessionStore`/`dailyStore`/`settingsStore` | `std::fs` + `serde_json` | 小 | 低 |
| IPC ハンドラ(33個) | `ipc/registerHandlers` | `#[tauri::command]` | 中 | 低 |
| ウィンドウ/トレイ | `windows/*` | Tauri window + tray | 中 | 低〜中 |
| パネル挙動 | `windows/popover` | tauri-nspanel + ネイティブ配置 | 中 | 中（上記落とし穴） |
| 認証/OAuth | `auth/*` | `keyring`/`jsonwebtoken`/deep-link plugin | 大 | 高（Keychain 代替） |
| 通知 | `notifications/*` | `tauri-plugin-notification` + `tokio::time` | 中 | 中 |
| 外部 API 連携 | `integrations/*` | `reqwest` | 中 | 低 |
| 自動アップデート | `update/*` | `reqwest` + `std::process::Command` 再実装 | 大 | 高 |
| 起動/ライフサイクル | `index.ts` | Tauri lifecycle + single-instance plugin | 中 | 低 |

### IPC 対応

| Electron | Tauri v2 |
| --- | --- |
| `ipcMain.handle` + `ipcRenderer.invoke` | `#[tauri::command]` + `invoke()` |
| `webContents.send` | `app.emit()` / `window.emit()` + `listen()` |
| 進捗ストリーム | `ipc::Channel<T>` |
| `contextBridge` | 不要（`@tauri-apps/api` を直接 import） |

renderer 側に薄い `electronAPI` 互換シムを1枚かませ、各メソッドを `invoke()` に転送すれば、
renderer のコールサイトをほぼ無改修で移行できる。

## 推奨実装順（アップデータは最後）

1. ✅ **データストア**（TDD 完了：session/daily/settings、計37テスト）
2. 🔄 IPC ハンドラ — ストア分はコマンド配線済み（27コマンド・invoke往復を実機検証）。残りの非ストア系（timer/attendance/update 等）は未着手
3. ⏳ ウィンドウ・トレイ・**パネル配置（ネイティブ）**（PoC で実証済み、本実装へ取り込み）
4. ✅ **通知**（純粋ロジック TDD 14テスト + tokio スケジューラ配線。`.app` で実発火確認）
5. 🔄 外部 API 連携 — **holidays 完了**（reqwest・TDD）。attendance/whiteboard は認証待ち
6. 🔄 認証 — **Keychain 代替（AuthStore）完了**（keyring・TDD・実Keychain round-trip確認）。
   OAuth signIn + deep-link コールバック + refreshSession は残り
7. ⏳ 自動アップデート（最複雑）

### 実装済みの構成（`poc/src-tauri/src/`）

- `types.rs` … Session/TimeInterval/WorkLocation（camelCase JSON 互換）
- `session_store.rs` / `daily_store.rs` / `settings_store.rs` … 各ストア（Mutex 直列化・
  tmp→rename 原子書き込み・.bak フォールバック）。`is_year_month`/`is_date`/`append_ext`/
  `StoreError` は session_store に集約し共有
- `commands.rs` … `#[tauri::command]`（ストア27 + 通知5）
- `notifications.rs` … 通知の純粋ロジック（idle判定/経過境界/ポモドーロ位相、TDD）
- `notif_scheduler.rs` … tokio タスクで周期実行（idle 60s ループ/elapsed/pomodoro）、
  `tauri-plugin-notification` で OS 通知表示。`NotificationEngine` を管理ステート化
- `holidays.rs` … 公開 API から祝日マップを reqwest 取得＋プロセス内キャッシュ（TDD）。
  HTTP クライアントのパターン基盤（attendance/whiteboard で再利用予定）
- `auth.rs` … セッション JWT。`parse_auth_status`（JWT payload→AuthStatus、TDD）+
  `AuthStore`（`safeStorage`→`keyring`/apple-native の Keychain 保存）。
  safeStorage(auth.enc) とは非互換 → 既存ユーザーは移行時に再ログイン要
- `lib.rs` … `app.manage` で各ストア+engine を登録、`resolve_data_dir`（Electron 互換
  パス、`JUICE_DATA_DIR` で上書き可）

データ層は **Electron 版の JSON ファイル・スキーマと完全互換**（同じファイル名・camelCase・
2スペース整形）。既存データをそのまま読み書きできる。

### ⚠️ 通知の落とし穴：配信は成功するが「連続」だと最初の1件しかバナーが出ない

`show()` は毎回 `Ok` を返し権限も `Granted`（＝**配信は毎回成功・配線は正常**）だが、
macOS は**同一アプリから短時間に連続到着した通知は最初の1件だけバナー表示**し、残りは
スロットリングして通知センターに積む（dev / `.app` どちらも同じ挙動）。
実アプリの idle/elapsed/pomodoro は**数分間隔・文面も毎回異なる**ため、この連打抑制には
当たらず通常表示される。テストボタンで連打すると1件しか出ないのは OS 仕様であり、コード起因
ではない。目視テストは文面を毎回変える + 間隔を空ける。

## ローカル環境メモ

- Rust：mise の `core:rust`（`~/.cargo` に rustup 経由で導入。グローバル config 書き込みは権限で失敗するが本体は動く）
- 起動：`cd poc && npm run tauri dev`（`~/.cargo/env` を source、`env -u ELECTRON_RUN_AS_NODE` 推奨）
