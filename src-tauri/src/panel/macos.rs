//! macOS 版のポップオーバー：main ウィンドウを非アクティベート NSPanel に変換して扱う。
//! Tauri の座標 API は macOS マルチモニタでバグがあるため、配置は AppKit を直接叩く。

use crate::AnchorPos;
use tauri::{AppHandle, Manager, WebviewWindow};
// tauri-nspanel が再エクスポートする `cocoa` 系は objc2 へ置換され deprecated 扱いだが、
// 現状 tauri-nspanel が提供する API がこれなので許容する（アップストリーム追従の課題）。
#[allow(deprecated)]
use tauri_nspanel::{
    cocoa::appkit::NSWindowCollectionBehavior, panel_delegate, ManagerExt, WebviewWindowExt,
};
// Tauri の set_position は macOS マルチモニタ座標バグ(tauri#7890/#7139)で効かないため、
// AppKit を直接叩いて配置する。
use objc::{class, msg_send, sel, sel_impl};
use block::ConcreteBlock;
#[allow(deprecated)]
use tauri_nspanel::cocoa::base::id;
#[allow(deprecated)]
use tauri_nspanel::cocoa::foundation::{NSPoint, NSRect};

const PANEL_WIDTH: f64 = 320.0;
const PANEL_HEIGHT: f64 = 520.0;

// AppKit 定数（cocoa クレートに定義が無いため直書き）
#[allow(non_upper_case_globals)]
const NSFloatWindowLevel: i32 = 4;
#[allow(non_upper_case_globals)]
const NSWindowStyleMaskNonActivatingPanel: i32 = 1 << 7;
// NSEventMask（マウス押下）。グローバル監視で「パネル外クリック」を捕捉するのに使う。
#[allow(non_upper_case_globals)]
const NSEventMaskLeftMouseDown: u64 = 1 << 1;
#[allow(non_upper_case_globals)]
const NSEventMaskRightMouseDown: u64 = 1 << 3;
#[allow(non_upper_case_globals)]
const NSEventMaskOtherMouseDown: u64 = 1 << 25;

/// blur 時に「アンカーから動いていたら閉じない」判定の移動しきい値（px）。
const DRAG_KEEP_OPEN_THRESHOLD: f64 = 20.0;

/// main ウィンドウを非アクティベート NSPanel に変換し、blur で閉じる挙動を仕込む。
#[allow(deprecated)] // tauri-nspanel の cocoa API（objc2 へ移行課題）
pub fn init(app_handle: &AppHandle) {
    let window: WebviewWindow = app_handle.get_webview_window("main").unwrap();
    let panel = window.to_panel().unwrap();

    // フローティングレベル（他ウィンドウより前面）
    panel.set_level(NSFloatWindowLevel);
    // ★ これがキモ：アプリをアクティブにせずに表示できる non-activating panel
    panel.set_style_mask(NSWindowStyleMaskNonActivatingPanel);
    // 表示時に現在の Space へ移動（全 Space 常駐＝「元画面に張り付く」のを回避）。
    // FullScreenAuxiliary はフルスクリーンアプリ上にも出せる挙動として残す。
    panel.set_collection_behaviour(
        NSWindowCollectionBehavior::NSWindowCollectionBehaviorMoveToActiveSpace
            | NSWindowCollectionBehavior::NSWindowCollectionBehaviorFullScreenAuxiliary,
    );

    // 背景ドラッグでのウィンドウ移動を無効化する。
    // これが有効だと tao の send_event が LeftMouseDown ごとに
    // performWindowDragWithEvent を呼び、一覧アイテムのドラッグでもウィンドウが動いて
    // しまう → アンカーから移動＝フローティング誤判定で「張り付く」。
    // ヘッダー移動は data-tauri-drag-region（DragWindow 経路）が別途担うため影響しない。
    panel.set_moveable_by_window_background(false);

    // blur-to-close：パネルが key ウィンドウでなくなったら（＝外側クリック）閉じる
    let handle = app_handle.to_owned();
    let delegate = panel_delegate!(JuicePanelDelegate {
        window_did_become_key,
        window_did_resign_key
    });
    delegate.set_listener(Box::new(move |name: String| {
        if name.as_str() == "window_did_resign_key" {
            // 「戻る」で出した直後は activation policy 切り替えで resign が飛ぶため無視する。
            if crate::blur_close_suppressed() {
                return;
            }
            // ヘッダーをドラッグしてアンカーから動かしていたら閉じない（フローティング維持）。
            if moved_from_anchor(&handle) {
                return;
            }
            if let Ok(panel) = handle.get_webview_panel("main") {
                panel.order_out(None);
            }
        }
    }));
    panel.set_delegate(delegate);

    // blur-to-close の取りこぼし対策（本命）。
    // 非アクティベート NSPanel は WebKit の HTML5 ドラッグや2回目以降の show のあと
    // windowDidResignKey が発火しないことがあり、外側クリックで閉じない（＝前面に張り付く）。
    // key/blur 状態に依存しないグローバルマウス監視で確実に閉じる。
    install_global_mouse_monitor(app_handle);
}

/// パネル表示中に「自アプリ外＝パネル外」がクリックされたら閉じる。
/// グローバル監視は他アプリへ配送されるイベントだけを拾う（自アプリのトレイ/パネル内
/// クリックは対象外）ため、外側クリックの検出に過不足がない。ヘッダードラッグで
/// フローティング中（アンカーから移動済み）は維持する。
#[allow(deprecated)] // tauri-nspanel の cocoa API（objc2 へ移行課題）
fn install_global_mouse_monitor(app_handle: &AppHandle) {
    let handle = app_handle.to_owned();
    let block = ConcreteBlock::new(move |_event: id| {
        if let Ok(panel) = handle.get_webview_panel("main") {
            if panel.is_visible() && !moved_from_anchor(&handle) {
                panel.order_out(None);
            }
        }
    });
    let block = block.copy();
    let mask: u64 =
        NSEventMaskLeftMouseDown | NSEventMaskRightMouseDown | NSEventMaskOtherMouseDown;
    unsafe {
        let monitor: id = msg_send![
            class!(NSEvent),
            addGlobalMonitorForEventsMatchingMask: mask
            handler: &*block
        ];
        // monitor（自動解放オブジェクト）と block はアプリ存続中保持する。
        let _: id = msg_send![monitor, retain];
    }
    // block は Cocoa 側が copy 済みだが、念のためアプリ存続中保持する。
    std::mem::forget(block);

    // フロート中（ヘッダードラッグでアンカーから移動 済み）の非アクティベート NSPanel は、
    // 長時間稼働・外部ディスプレイ環境下で稀に「クリックしても key window にならない」
    // ケースが起きる（WindowServer 側のキーウィンドウ管理と非アクティベートパネルの
    // 組み合わせに起因する既知の相性問題。tauri-nspanel #75 等）。
    // 見た目は最前面でもキーボード入力が背後のアプリに渡ってしまい、モーダルの
    // フォームに入力できなくなる。パネル内クリックのたびに明示的に makeKeyWindow を
    // 呼び直し、OS 側の暗黙の挙動に依存せず確実にキーウィンドウを奪い返す。
    install_local_focus_reclaim_monitor(app_handle);
}

/// 自アプリ（パネル）内でのクリックのたびに明示的に makeKeyWindow する。
/// ローカル監視は自アプリの各ウィンドウへ配送される直前のイベントを拾うため、
/// パネル外クリックには反応しない（グローバル監視とは別役割）。
#[allow(deprecated)] // tauri-nspanel の cocoa API（objc2 へ移行課題）
fn install_local_focus_reclaim_monitor(app_handle: &AppHandle) {
    let handle = app_handle.to_owned();
    let block = ConcreteBlock::new(move |event: id| -> id {
        // イベントの発生元が main パネル自身のときだけ奪還する。
        // カレンダー窓など他ウィンドウのクリックで奪い返すと、そちらの
        // キーボード入力が効かなくなる（#131）。
        // 比較には Tauri 公式の ns_window()（NSWindow* を返す）を使う。
        let main_ns_window = handle
            .get_webview_window("main")
            .and_then(|w| w.ns_window().ok());
        let is_panel_event = match main_ns_window {
            Some(ptr) => unsafe {
                let event_window: id = msg_send![event, window];
                !event_window.is_null() && event_window as *mut std::ffi::c_void == ptr
            },
            None => false,
        };
        if is_panel_event {
            if let Ok(panel) = handle.get_webview_panel("main") {
                if panel.is_visible() {
                    panel.make_key_window();
                }
            }
        }
        event
    });
    let block = block.copy();
    let mask: u64 =
        NSEventMaskLeftMouseDown | NSEventMaskRightMouseDown | NSEventMaskOtherMouseDown;
    unsafe {
        let monitor: id = msg_send![
            class!(NSEvent),
            addLocalMonitorForEventsMatchingMask: mask
            handler: &*block
        ];
        let _: id = msg_send![monitor, retain];
    }
    std::mem::forget(block);
}

/// パネルが表示中か。
pub fn is_visible(app: &AppHandle) -> bool {
    app.get_webview_panel("main")
        .map(|p| p.is_visible())
        .unwrap_or(false)
}

/// パネルを隠す（blur-to-close と同じ order_out）。
pub fn hide(app: &AppHandle) {
    if let Ok(panel) = app.get_webview_panel("main") {
        panel.order_out(None);
    }
}

/// 配置済みのパネルを表示する。non-activating なので他アプリのフォーカスは奪わない。
pub fn show(app: &AppHandle) {
    if let Ok(panel) = app.get_webview_panel("main") {
        panel.show();
    }
}

/// 直前の外側クリックで閉じたばかりか。macOS のグローバル監視は自アプリのトレイクリックを
/// 拾わないため、トレイクリックで閉じて即開き直す競合は起きない。
pub fn hidden_by_blur_just_now() -> bool {
    false
}

/// 前回パネルを出した位置（アンカー）へ戻す。記録が無ければ false。
#[allow(deprecated)] // tauri-nspanel の cocoa API（objc2 へ移行課題）
pub fn restore_position(window: &WebviewWindow) -> bool {
    let anchor = {
        let g = window.state::<AnchorPos>();
        let v = *g.0.lock().unwrap_or_else(|e| e.into_inner());
        v
    };
    let Some((x, y)) = anchor else {
        return false;
    };
    let ns_window = match window.ns_window() {
        Ok(ptr) => ptr as id,
        Err(_) => return false,
    };
    eprintln!("[juice] native place: restore anchor -> origin=({x:.0},{y:.0})");
    unsafe {
        let _: () = msg_send![ns_window, setFrameOrigin: NSPoint { x, y }];
    }
    true
}

/// AppKit を直接叩いてパネルを配置する。
/// カーソルのグローバル座標（Cocoa の左下原点・全画面共通空間）からカーソルが居る
/// NSScreen を特定し、その画面のメニューバー直下・カーソル中央に setFrameOrigin する。
/// Tauri の座標変換（macOS マルチモニタでバグあり）を完全にバイパスする。
#[allow(deprecated)] // tauri-nspanel の cocoa API（objc2 へ移行課題）
pub fn position_at_cursor(window: &WebviewWindow) {
    let ns_window = match window.ns_window() {
        Ok(ptr) => ptr as id,
        Err(_) => return,
    };
    unsafe {
        // カーソルのグローバル座標（左下原点・全ディスプレイ共通）
        let mouse: NSPoint = msg_send![class!(NSEvent), mouseLocation];

        // カーソルを含む NSScreen の visibleFrame（メニューバー/Dock を除いた領域）を取得
        let screens: id = msg_send![class!(NSScreen), screens];
        let count: usize = msg_send![screens, count];
        let mut visible: Option<NSRect> = None;
        for i in 0..count {
            let screen: id = msg_send![screens, objectAtIndex: i];
            let frame: NSRect = msg_send![screen, frame];
            let in_x = mouse.x >= frame.origin.x && mouse.x <= frame.origin.x + frame.size.width;
            let in_y = mouse.y >= frame.origin.y && mouse.y <= frame.origin.y + frame.size.height;
            if in_x && in_y {
                visible = Some(msg_send![screen, visibleFrame]);
                break;
            }
        }
        let vis = match visible {
            Some(v) => v,
            None => return,
        };

        // 左下原点：可視領域の上端からパネル高さを引いた位置が origin.y
        let top_y = vis.origin.y + vis.size.height;
        let origin_x = mouse.x - PANEL_WIDTH / 2.0;
        let origin_y = top_y - PANEL_HEIGHT;

        eprintln!(
            "[juice] native place: mouse=({:.0},{:.0}) visTop={:.0} -> origin=({:.0},{:.0})",
            mouse.x, mouse.y, top_y, origin_x, origin_y
        );
        let origin = NSPoint {
            x: origin_x,
            y: origin_y,
        };
        let _: () = msg_send![ns_window, setFrameOrigin: origin];

        // 表示位置をアンカーとして記録（blur 時の移動判定に使う）
        *window
            .state::<AnchorPos>()
            .0
            .lock()
            .unwrap_or_else(|e| e.into_inner()) = Some((origin_x, origin_y));
    }
}

/// パネルが表示時アンカーから DRAG_KEEP_OPEN_THRESHOLD 以上ドラッグ移動されているか。
#[allow(deprecated)] // tauri-nspanel の cocoa API（objc2 へ移行課題）
fn moved_from_anchor(app: &AppHandle) -> bool {
    let anchor = {
        let g = app.state::<AnchorPos>();
        let v = *g.0.lock().unwrap_or_else(|e| e.into_inner());
        v
    };
    let anchor = match anchor {
        Some(a) => a,
        None => return false,
    };
    let window = match app.get_webview_window("main") {
        Some(w) => w,
        None => return false,
    };
    let ns_window = match window.ns_window() {
        Ok(p) => p as id,
        Err(_) => return false,
    };
    unsafe {
        let frame: NSRect = msg_send![ns_window, frame];
        (frame.origin.x - anchor.0).abs() > DRAG_KEEP_OPEN_THRESHOLD
            || (frame.origin.y - anchor.1).abs() > DRAG_KEEP_OPEN_THRESHOLD
    }
}
