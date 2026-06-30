// 通知の純粋ロジック（Electron 版 src/main/notifications/* の判定/計算部分の移植）。
// タイマー・OS 通知表示・スケジューリングの副作用は別レイヤ（scheduler 配線）で扱い、
// ここは決定論的にテスト可能な「いつ・何を通知すべきか」だけを持つ。
// NOTE: scheduler 配線が入るまでは未使用のため dead_code を許可している。
#![allow(dead_code)]

pub const NOTIF_TITLE: &str = "Juice";
pub const IDLE_BODY: &str = "ジュースを飲みたくありませんか？";
pub const POMODORO_BREAK: &str = "25分経ちました。5分休憩してください";
pub const POMODORO_RESUME: &str = "休憩終了です。作業を再開しましょう";

/// ポモドーロ周期: 作業25分 → 休憩5分 の30分周期（固定）。
const WORK_MS: i64 = 25 * 60 * 1000;
const CYCLE_MS: i64 = 30 * 60 * 1000;

/// アクティビティ状態（最後の操作時刻・アイドル通知済みフラグ）。
/// 時刻は外から ms で注入する（テスト容易性のためクロックを内蔵しない）。
pub struct ActivityState {
    last_activity_ms: i64,
    idle_sent: bool,
}

impl ActivityState {
    pub fn new(now_ms: i64) -> Self {
        Self {
            last_activity_ms: now_ms,
            idle_sent: false,
        }
    }
    pub fn record_activity(&mut self, now_ms: i64) {
        self.last_activity_ms = now_ms;
        self.idle_sent = false;
    }
    pub fn last_activity_ms(&self) -> i64 {
        self.last_activity_ms
    }
    pub fn was_idle_sent(&self) -> bool {
        self.idle_sent
    }
    pub fn mark_idle_sent(&mut self) {
        self.idle_sent = true;
    }
}

/// アイドル通知を出すべきか。閾値以上・未通知・タイマー非稼働がすべて真のとき。
pub fn should_notify_idle(
    idle_ms: i64,
    threshold_ms: i64,
    already_sent: bool,
    timer_running: bool,
) -> bool {
    idle_ms >= threshold_ms && !already_sent && !timer_running
}

/// 経過通知: 次の境界に達していれば「通知すべき累計分」を返す（未達なら None）。
pub fn elapsed_due(now_ms: i64, start_ms: i64, interval_ms: i64, count: i64) -> Option<i64> {
    let next_at = start_ms + interval_ms * (count + 1);
    if now_ms >= next_at {
        Some(interval_ms / 60_000 * (count + 1))
    } else {
        None
    }
}

/// 経過通知の本文。
pub fn elapsed_body(total_minutes: i64) -> String {
    format!("作業中 — {total_minutes}分経過しました")
}

/// 次のフェーズ境界までの遅延(ms)。pos<25分なら作業境界まで、以降は周期末まで。
pub fn pomodoro_next_delay(now_ms: i64, start_ms: i64) -> i64 {
    let pos = (now_ms - start_ms).rem_euclid(CYCLE_MS);
    if pos < WORK_MS {
        WORK_MS - pos
    } else {
        CYCLE_MS - pos
    }
}

/// 発火時点の周期内位置からメッセージを選ぶ（スリープで遅延しても発火時点で判定）。
pub fn pomodoro_message(fired_pos_ms: i64) -> &'static str {
    if fired_pos_ms >= WORK_MS {
        POMODORO_BREAK
    } else {
        POMODORO_RESUME
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MIN: i64 = 60 * 1000;

    // ---- ActivityState ----

    #[test]
    fn record_activity_updates_time_and_clears_sent() {
        let mut a = ActivityState::new(0);
        a.mark_idle_sent();
        assert!(a.was_idle_sent());
        a.record_activity(5000);
        assert_eq!(a.last_activity_ms(), 5000);
        assert!(!a.was_idle_sent());
    }

    #[test]
    fn mark_idle_sets_sent() {
        let mut a = ActivityState::new(0);
        assert!(!a.was_idle_sent());
        a.mark_idle_sent();
        assert!(a.was_idle_sent());
    }

    // ---- idle 判定 ----

    #[test]
    fn idle_notifies_when_over_threshold() {
        // 30分閾値、60分アイドル、未通知、非稼働 → 通知
        assert!(should_notify_idle(60 * MIN, 30 * MIN, false, false));
    }

    #[test]
    fn idle_not_below_threshold() {
        assert!(!should_notify_idle(20 * MIN, 30 * MIN, false, false));
    }

    #[test]
    fn idle_not_when_already_sent() {
        assert!(!should_notify_idle(60 * MIN, 30 * MIN, true, false));
    }

    #[test]
    fn idle_not_when_timer_running() {
        assert!(!should_notify_idle(60 * MIN, 30 * MIN, false, true));
    }

    // ---- elapsed 判定 ----

    #[test]
    fn elapsed_due_at_first_boundary() {
        // 30分間隔、開始0、30分経過、count 0 → 30分通知
        assert_eq!(elapsed_due(30 * MIN, 0, 30 * MIN, 0), Some(30));
    }

    #[test]
    fn elapsed_not_due_before_boundary() {
        assert_eq!(elapsed_due(20 * MIN, 0, 30 * MIN, 0), None);
    }

    #[test]
    fn elapsed_due_at_second_boundary() {
        // count 1 のとき次は 60分、累計 60分
        assert_eq!(elapsed_due(60 * MIN, 0, 30 * MIN, 1), Some(60));
        assert_eq!(elapsed_due(59 * MIN, 0, 30 * MIN, 1), None);
    }

    #[test]
    fn elapsed_body_text() {
        assert_eq!(elapsed_body(30), "作業中 — 30分経過しました");
        assert_eq!(elapsed_body(60), "作業中 — 60分経過しました");
    }

    // ---- pomodoro 計算 ----

    #[test]
    fn pomodoro_delay_from_start_is_work() {
        // 開始直後は作業境界(25分)まで
        assert_eq!(pomodoro_next_delay(0, 0), 25 * MIN);
    }

    #[test]
    fn pomodoro_delay_at_work_boundary_is_break() {
        // 25分時点では周期末(30分)まで＝5分
        assert_eq!(pomodoro_next_delay(25 * MIN, 0), 5 * MIN);
    }

    #[test]
    fn pomodoro_delay_wraps_cycle() {
        // 30分時点では次サイクルの作業境界＝25分後
        assert_eq!(pomodoro_next_delay(30 * MIN, 0), 25 * MIN);
    }

    #[test]
    fn pomodoro_message_by_phase() {
        // 25分位置以降は休憩メッセージ、未満は再開メッセージ
        assert_eq!(pomodoro_message(25 * MIN), POMODORO_BREAK);
        assert_eq!(pomodoro_message(0), POMODORO_RESUME);
    }
}
