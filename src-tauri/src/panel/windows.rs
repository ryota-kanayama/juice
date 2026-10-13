//! Windows 版のポップオーバー：main ウィンドウを常に最前面・タスクバー非表示の
//! 通常ウィンドウとして扱う（NSPanel 相当の非アクティベート表示は無いので、表示時に
//! フォーカスを取り、フォーカスを失ったら閉じる）。
//! 配置はカーソルのいるモニターの作業領域（タスクバーを除いた領域）から、
//! タスクバーのある辺に寄せて決める。座標はすべて物理ピクセル。

use crate::AnchorPos;
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::{AppHandle, Manager, PhysicalPosition, WebviewWindow, WindowEvent};

/// blur 時に「アンカーから動いていたら閉じない」判定の移動しきい値（論理 px）。
const DRAG_KEEP_OPEN_THRESHOLD: f64 = 20.0;

/// 作業領域の端からパネルまでの余白（論理 px）。
const EDGE_MARGIN: f64 = 8.0;

/// blur で閉じた直後のトレイクリックを「閉じる操作」とみなす猶予。
/// 表示中にトレイを押すと、先にフォーカス喪失で閉じ、続くクリックで開き直してしまうため。
const TRAY_REOPEN_GUARD_MS: u64 = 300;

static LAST_BLUR_HIDE_MS: AtomicU64 = AtomicU64::new(0);

/// blur-to-close を仕込む。
pub fn init(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let handle = app.to_owned();
    window.on_window_event(move |ev| {
        if let WindowEvent::Focused(false) = ev {
            // ヘッダーのドラッグ開始時など、フォーカスが WebView から親ウィンドウへ移るだけでも
            // 一瞬 Focused(false) が届く。少し待ってからまだフォーカスが無いときだけ閉じる。
            let handle = handle.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_millis(BLUR_CONFIRM_MS)).await;
                close_if_blurred(&handle);
            });
        }
    });
}

/// フォーカス喪失を確かめるまでの待ち時間。
const BLUR_CONFIRM_MS: u64 = 120;

fn close_if_blurred(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    if window.is_focused().unwrap_or(false) {
        return;
    }
    if crate::blur_close_suppressed() || moved_from_anchor(app) {
        return;
    }
    if is_visible(app) {
        hide(app);
        LAST_BLUR_HIDE_MS.store(crate::now_ms(), Ordering::SeqCst);
    }
}

/// パネルが表示中か。
pub fn is_visible(app: &AppHandle) -> bool {
    app.get_webview_window("main")
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false)
}

/// パネルを隠す。
pub fn hide(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

/// 配置済みのパネルを表示し、フォーカスを取る（blur-to-close とキーボード入力のため）。
pub fn show(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// 直前の blur で閉じたばかりか。
pub fn hidden_by_blur_just_now() -> bool {
    crate::now_ms().saturating_sub(LAST_BLUR_HIDE_MS.load(Ordering::SeqCst)) < TRAY_REOPEN_GUARD_MS
}

/// 前回パネルを出した位置（アンカー）へ戻す。記録が無ければ false。
pub fn restore_position(window: &WebviewWindow) -> bool {
    let Some((x, y)) = anchor(window) else {
        return false;
    };
    window
        .set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32))
        .is_ok()
}

/// カーソルのいるモニターで、タスクバーのある辺に寄せてパネルを配置する。
/// タスクバーが下（既定）ならカーソル中央・タスクバーの直上に出る。
pub fn position_at_cursor(window: &WebviewWindow) {
    let Ok(cursor) = window.cursor_position() else {
        return;
    };
    let Ok(Some(monitor)) = window.monitor_from_point(cursor.x, cursor.y) else {
        return;
    };
    let Ok(size) = window.outer_size() else {
        return;
    };
    let scale = monitor.scale_factor();
    let margin = EDGE_MARGIN * scale;
    let (w, h) = (size.width as f64, size.height as f64);

    let mon_pos = monitor.position();
    let mon_size = monitor.size();
    let work = monitor.work_area();
    let (mon_l, mon_t) = (mon_pos.x as f64, mon_pos.y as f64);
    let (mon_r, mon_b) = (mon_l + mon_size.width as f64, mon_t + mon_size.height as f64);
    let (work_l, work_t) = (work.position.x as f64, work.position.y as f64);
    let (work_r, work_b) = (
        work_l + work.size.width as f64,
        work_t + work.size.height as f64,
    );

    let (x, y) = place(
        Rect { l: mon_l, t: mon_t, r: mon_r, b: mon_b },
        Rect { l: work_l, t: work_t, r: work_r, b: work_b },
        (cursor.x, cursor.y),
        (w, h),
        margin,
    );
    eprintln!("[juice] place: cursor=({:.0},{:.0}) -> ({x:.0},{y:.0})", cursor.x, cursor.y);
    let _ = window.set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32));

    // 表示位置をアンカーとして記録（blur 時の移動判定に使う）
    *window
        .state::<AnchorPos>()
        .0
        .lock()
        .unwrap_or_else(|e| e.into_inner()) = Some((x, y));
}

#[derive(Clone, Copy)]
struct Rect {
    l: f64,
    t: f64,
    r: f64,
    b: f64,
}

/// モニター全体と作業領域の差からタスクバーの辺を判定し、パネルの左上座標を返す。
/// タスクバーが自動的に隠れる設定などで差が無いときは、下にあるものとして扱う。
fn place(mon: Rect, work: Rect, cursor: (f64, f64), size: (f64, f64), margin: f64) -> (f64, f64) {
    let (w, h) = size;
    let clamp = |v: f64, lo: f64, hi: f64| if hi < lo { lo } else { v.clamp(lo, hi) };
    let x_center = clamp(cursor.0 - w / 2.0, work.l + margin, work.r - w - margin);
    let y_center = clamp(cursor.1 - h / 2.0, work.t + margin, work.b - h - margin);
    if work.t > mon.t {
        (x_center, work.t + margin)
    } else if work.l > mon.l {
        (work.l + margin, y_center)
    } else if work.r < mon.r {
        (work.r - w - margin, y_center)
    } else {
        (x_center, work.b - h - margin)
    }
}

fn anchor(window: &WebviewWindow) -> Option<(f64, f64)> {
    let g = window.state::<AnchorPos>();
    let v = *g.0.lock().unwrap_or_else(|e| e.into_inner());
    v
}

/// パネルが表示時アンカーから DRAG_KEEP_OPEN_THRESHOLD 以上ドラッグ移動されているか。
fn moved_from_anchor(app: &AppHandle) -> bool {
    let Some(window) = app.get_webview_window("main") else {
        return false;
    };
    let Some((ax, ay)) = anchor(&window) else {
        return false;
    };
    let Ok(pos) = window.outer_position() else {
        return false;
    };
    let threshold = DRAG_KEEP_OPEN_THRESHOLD * window.scale_factor().unwrap_or(1.0);
    (pos.x as f64 - ax).abs() > threshold || (pos.y as f64 - ay).abs() > threshold
}

#[cfg(test)]
mod tests {
    use super::*;

    const MON: Rect = Rect { l: 0.0, t: 0.0, r: 1920.0, b: 1080.0 };
    const SIZE: (f64, f64) = (320.0, 520.0);

    #[test]
    fn bottom_taskbar_places_above_it_centered_on_cursor() {
        let work = Rect { b: 1032.0, ..MON };
        let (x, y) = place(MON, work, (1700.0, 1050.0), SIZE, 8.0);
        assert_eq!((x, y), (1540.0, 1032.0 - 520.0 - 8.0));
    }

    #[test]
    fn clamps_inside_work_area_near_right_edge() {
        let work = Rect { b: 1032.0, ..MON };
        let (x, _) = place(MON, work, (1910.0, 1050.0), SIZE, 8.0);
        assert_eq!(x, 1920.0 - 320.0 - 8.0);
    }

    #[test]
    fn top_taskbar_places_below_it() {
        let work = Rect { t: 48.0, ..MON };
        let (_, y) = place(MON, work, (500.0, 20.0), SIZE, 8.0);
        assert_eq!(y, 56.0);
    }

    #[test]
    fn left_and_right_taskbars_place_beside_them() {
        let left = Rect { l: 60.0, ..MON };
        assert_eq!(place(MON, left, (30.0, 900.0), SIZE, 8.0).0, 68.0);
        let right = Rect { r: 1860.0, ..MON };
        assert_eq!(place(MON, right, (1890.0, 900.0), SIZE, 8.0).0, 1860.0 - 320.0 - 8.0);
    }

    #[test]
    fn hidden_taskbar_falls_back_to_bottom() {
        let (_, y) = place(MON, MON, (960.0, 1079.0), SIZE, 8.0);
        assert_eq!(y, 1080.0 - 520.0 - 8.0);
    }
}
