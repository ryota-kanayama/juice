// 通知スケジューラ（Electron 版 idle/elapsed/pomodoro の setInterval/setTimeout 相当）。
// 純粋ロジック(notifications)を消費し、tokio タスクで周期実行して OS 通知を出す。
// 設計上、std::sync::MutexGuard を .await をまたいで保持しない（タスクを Send に保つため）。

use crate::notifications::{
    elapsed_body, elapsed_due, pomodoro_cycle_pos, pomodoro_message, pomodoro_next_delay,
    should_notify_idle, ActivityState, IDLE_BODY, NOTIF_TITLE,
};
use crate::settings_store::SettingsStore;
use std::sync::Mutex;
use std::time::Duration;
use tauri::async_runtime::JoinHandle;
use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

#[derive(Default)]
struct Inner {
    timer_start_ms: Option<i64>,
    elapsed_count: i64,
    elapsed_task: Option<JoinHandle<()>>,
    pomodoro_start_ms: Option<i64>,
    pomodoro_task: Option<JoinHandle<()>>,
    idle_task: Option<JoinHandle<()>>,
}

pub struct NotificationEngine {
    inner: Mutex<Inner>,
    activity: Mutex<ActivityState>,
}

impl NotificationEngine {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(Inner::default()),
            activity: Mutex::new(ActivityState::new(now_ms())),
        }
    }
}

fn show(app: &AppHandle, body: &str) {
    if let Err(e) = app
        .notification()
        .builder()
        .title(NOTIF_TITLE)
        .body(body)
        .show()
    {
        eprintln!("[notif] show error: {e}");
    }
}

/// 即時通知（配線の動作確認用）。
/// macOS は同一文面の連続通知を抑制するため、毎回ユニークになるよう時刻を含める。
pub fn show_test(app: &AppHandle) {
    let t = chrono::Local::now().format("%H:%M:%S");
    show(app, &format!("通知テスト {t} — これが見えれば配線 OK"));
}

/// 起動時にアイドル監視ループを開始する（設定は毎 tick 読むので自己調整）。
pub fn init(app: &AppHandle) {
    let handle = spawn_idle_loop(app.clone());
    let engine = app.state::<NotificationEngine>();
    lock_inner(&engine).idle_task = Some(handle);
}

pub fn record_activity(app: &AppHandle) {
    let engine = app.state::<NotificationEngine>();
    engine
        .activity
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .record_activity(now_ms());
}

pub fn on_timer_started(app: &AppHandle) {
    {
        let engine = app.state::<NotificationEngine>();
        let mut inner = lock_inner(&engine);
        let now = now_ms();
        inner.timer_start_ms = Some(now);
        inner.elapsed_count = 0;
        inner.pomodoro_start_ms = Some(now);
        abort(inner.elapsed_task.take());
        abort(inner.pomodoro_task.take());
    }
    record_activity(app); // Electron 版はタイマー開始時に recordActivity
    restart_timer_loops(app);
}

pub fn on_timer_stopped(app: &AppHandle) {
    let engine = app.state::<NotificationEngine>();
    let mut inner = lock_inner(&engine);
    inner.timer_start_ms = None;
    inner.elapsed_count = 0;
    inner.pomodoro_start_ms = None;
    abort(inner.elapsed_task.take());
    abort(inner.pomodoro_task.take());
}

pub fn on_timer_adjust(app: &AppHandle, new_start_ms: i64) {
    {
        let engine = app.state::<NotificationEngine>();
        let mut inner = lock_inner(&engine);
        if inner.timer_start_ms.is_none() {
            return; // 非稼働なら何もしない
        }
        inner.timer_start_ms = Some(new_start_ms);
        inner.elapsed_count = 0;
        inner.pomodoro_start_ms = Some(new_start_ms);
        abort(inner.elapsed_task.take());
        abort(inner.pomodoro_task.take());
    }
    restart_timer_loops(app);
}

// ---- 内部 ----

fn lock_inner<'a>(engine: &'a tauri::State<'_, NotificationEngine>) -> std::sync::MutexGuard<'a, Inner> {
    engine.inner.lock().unwrap_or_else(|e| e.into_inner())
}

fn abort(handle: Option<JoinHandle<()>>) {
    if let Some(h) = handle {
        h.abort();
    }
}

fn restart_timer_loops(app: &AppHandle) {
    let eh = spawn_elapsed_loop(app.clone());
    let ph = spawn_pomodoro_loop(app.clone());
    let engine = app.state::<NotificationEngine>();
    let mut inner = lock_inner(&engine);
    inner.elapsed_task = Some(eh);
    inner.pomodoro_task = Some(ph);
}

/// 60秒ごとにアイドルを判定（Electron 版 idle.ts）。
fn spawn_idle_loop(app: AppHandle) -> JoinHandle<()> {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(60)).await;
            let (enabled, minutes) = app.state::<SettingsStore>().get_idle_settings();
            if !enabled {
                continue;
            }
            let engine = app.state::<NotificationEngine>();
            let now = now_ms();
            let (idle_ms, sent, running) = {
                let act = engine.activity.lock().unwrap_or_else(|e| e.into_inner());
                let inner = lock_inner(&engine);
                (
                    now - act.last_activity_ms(),
                    act.was_idle_sent(),
                    inner.timer_start_ms.is_some(),
                )
            };
            if should_notify_idle(idle_ms, minutes * 60_000, sent, running) {
                show(&app, IDLE_BODY);
                engine
                    .activity
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .mark_idle_sent();
            }
        }
    })
}

/// 60秒ごとに経過境界を判定（Electron 版 elapsed.ts）。タイマー停止で abort される。
fn spawn_elapsed_loop(app: AppHandle) -> JoinHandle<()> {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(60)).await;
            let (enabled, minutes) = app.state::<SettingsStore>().get_elapsed_settings();
            if !enabled {
                continue;
            }
            let engine = app.state::<NotificationEngine>();
            let (start, count) = {
                let inner = lock_inner(&engine);
                (inner.timer_start_ms, inner.elapsed_count)
            };
            let start = match start {
                Some(s) => s,
                None => continue,
            };
            if let Some(total) = elapsed_due(now_ms(), start, minutes * 60_000, count) {
                show(&app, &elapsed_body(total));
                lock_inner(&app.state::<NotificationEngine>()).elapsed_count += 1;
            }
        }
    })
}

/// 次のフェーズ境界に setTimeout 相当で起床し通知（Electron 版 pomodoro.ts）。
fn spawn_pomodoro_loop(app: AppHandle) -> JoinHandle<()> {
    tauri::async_runtime::spawn(async move {
        loop {
            let start = {
                let engine = app.state::<NotificationEngine>();
                let inner = lock_inner(&engine);
                inner.pomodoro_start_ms
            };
            let start = match start {
                Some(s) => s,
                None => break,
            };
            let delay = pomodoro_next_delay(now_ms(), start).max(0) as u64;
            tokio::time::sleep(Duration::from_millis(delay)).await;
            // 起床後に停止/調整されていないか再確認
            let start = {
                let engine = app.state::<NotificationEngine>();
                let inner = lock_inner(&engine);
                inner.pomodoro_start_ms
            };
            let start = match start {
                Some(s) => s,
                None => break,
            };
            if app.state::<SettingsStore>().get_pomodoro_enabled() {
                let pos = pomodoro_cycle_pos(now_ms(), start);
                show(&app, pomodoro_message(pos));
            }
        }
    })
}
