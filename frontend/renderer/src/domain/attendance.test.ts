import { describe, it, expect } from 'vitest'
import { buildAttendanceText, calcBreakMinutes, isValidWorkTime } from './attendance'
import type { Session } from '../types/session'
import { makeSession } from '../test/factories'

/** 勤怠テキストに出るのは PJコード・名前・作業区分・合計分・勤務場所だけなので、それ以外は既定値でよい */
const task = (overrides: Partial<Session> = {}): Session => makeSession({
  name: 'テスト作業',
  projectCode: 'ZZ',
  workCategory: '設計',
  totalTime: 180,
  ...overrides,
})

describe('buildAttendanceText', () => {
  describe('出力フォーマット', () => {
    it('「勤怠」「出勤 退勤 休憩」「PJ 名前 区分 分」の行を改行でつなぐ', () => {
      // 09:00〜12:00 休憩0 → 実労働180分 = タイマー合計なので調整なし
      const sessions = [task({ totalTime: 180 })]

      const { text } = buildAttendanceText(sessions, '09:00', '12:00', 0)

      expect(text).toBe('勤怠\n09:00 12:00 0\nZZ テスト作業 設計 180')
    })

    it('名前の前後・中間の空白（全角含む）を全て除去する', () => {
      const sessions = [task({ name: '  テ スト　作業  ' })]

      const { text } = buildAttendanceText(sessions, '09:00', '12:00', 0)

      expect(text).toBe('勤怠\n09:00 12:00 0\nZZ テスト作業 設計 180')
    })

    it('totalTime が 0 のセッションは行に出さない', () => {
      const sessions = [task({ totalTime: 0 })]

      const { text } = buildAttendanceText(sessions, '08:37', '18:40', 60)

      expect(text).toBe('勤怠\n08:37 18:40 60')
    })

    it('出勤・退勤が null なら時刻欄は空で出す', () => {
      const sessions = [task()]

      const { text } = buildAttendanceText(sessions, null, null, 60)

      expect(text).toBe('勤怠\n  60\nZZ テスト作業 設計 180')
    })
  })

  describe('同じタスクの集約', () => {
    it('同じ taskId・同じ勤務場所のセッションは1行に合算する', () => {
      const sessions = [
        task({ id: 'a', taskId: 't', totalTime: 120 }),
        task({ id: 'b', taskId: 't', totalTime: 60 }),
      ]

      const { text } = buildAttendanceText(sessions, '10:00', '13:00', 0)

      expect(text).toBe('勤怠\n10:00 13:00 0\nZZ テスト作業 設計 180')
    })

    it('同じタスクでも出社とテレワークは2行に分ける', () => {
      const sessions = [
        task({ id: 'a', taskId: 't', totalTime: 120, workLocation: 'office' }),
        task({ id: 'b', taskId: 't', totalTime: 60, workLocation: 'telework' }),
      ]

      const { text } = buildAttendanceText(sessions, '10:00', '13:00', 0)

      expect(text).toBe('勤怠\n10:00 13:00 0\nZZ テスト作業 設計 120\nZZ テスト作業 設計 60 tw')
    })
  })

  describe('勤務場所', () => {
    it('テレワークのセッションは行末に tw を付ける', () => {
      const sessions = [task({ workLocation: 'telework' })]

      const { text } = buildAttendanceText(sessions, '10:00', '13:00', 0)

      expect(text).toBe('勤怠\n10:00 13:00 0\nZZ テスト作業 設計 180 tw')
    })

    it('workLocation 未指定（出社）のセッションは tw を付けない', () => {
      const sessions = [task()]

      const { text } = buildAttendanceText(sessions, '10:00', '13:00', 0)

      expect(text).toBe('勤怠\n10:00 13:00 0\nZZ テスト作業 設計 180')
    })
  })

  describe('タイマー合計が実労働時間に足りないとき', () => {
    it('差分を最後のタスクに加算する', () => {
      // 08:37〜18:40 = 603分 - 休憩60 → 実労働543分。タイマー180分 → 差分363分
      const sessions = [task({ totalTime: 180 })]

      const { text } = buildAttendanceText(sessions, '08:37', '18:40', 60)

      expect(text).toBe('勤怠\n08:37 18:40 60\nZZ テスト作業 設計 543')
    })

    it('複数タスクなら最後のタスクにだけ加算する', () => {
      // 実労働543分。タイマー180+60=240分 → 差分303分 → 最後のタスク 60+303=363
      const sessions = [
        task({ id: 'a', taskId: 't1', name: '社内MTG', workCategory: '打合せ', totalTime: 180 }),
        task({ id: 'b', taskId: 't2', name: '1on1', workCategory: '打合せ', totalTime: 60 }),
      ]

      const { text } = buildAttendanceText(sessions, '08:37', '18:40', 60)

      expect(text).toBe('勤怠\n08:37 18:40 60\nZZ 社内MTG 打合せ 180\nZZ 1on1 打合せ 363')
    })

    it('overageMinutes は null', () => {
      const sessions = [task({ totalTime: 180 })]

      const { overageMinutes } = buildAttendanceText(sessions, '08:37', '18:40', 60)

      expect(overageMinutes).toBeNull()
    })
  })

  describe('タイマー合計が実労働時間と同じとき', () => {
    it('分数を変えない', () => {
      const sessions = [task({ totalTime: 180 })]

      const { text } = buildAttendanceText(sessions, '09:00', '12:00', 0)

      expect(text).toBe('勤怠\n09:00 12:00 0\nZZ テスト作業 設計 180')
    })

    it('overageMinutes は null', () => {
      const sessions = [task({ totalTime: 180 })]

      const { overageMinutes } = buildAttendanceText(sessions, '09:00', '12:00', 0)

      expect(overageMinutes).toBeNull()
    })
  })

  describe('タイマー合計が実労働時間を超えるとき', () => {
    it('超過分を末尾タスクから減算する', () => {
      // 実労働180分。タイマー200分 → 超過20分
      const sessions = [task({ totalTime: 200 })]

      const { text } = buildAttendanceText(sessions, '09:00', '12:00', 0)

      expect(text).toBe('勤怠\n09:00 12:00 0\nZZ テスト作業 設計 180')
    })

    it('超過した分数を overageMinutes で返す', () => {
      const sessions = [task({ totalTime: 200 })]

      const { overageMinutes } = buildAttendanceText(sessions, '09:00', '12:00', 0)

      expect(overageMinutes).toBe(20)
    })

    it('0分のタスクが出なければ hasZeroTask は false', () => {
      const sessions = [task({ totalTime: 200 })]

      const { hasZeroTask } = buildAttendanceText(sessions, '09:00', '12:00', 0)

      expect(hasZeroTask).toBe(false)
    })

    describe('末尾タスクだけでは引ききれない場合', () => {
      // 09:00〜12:00 - 休憩30 → 実労働150分。タイマー180+60=240分 → 超過90分
      // → 1on1: 60-90 → 0（残30を手前へ繰り上げ）, 社内MTG: 180-30 → 150
      const sessions = [
        task({ id: 'a', taskId: 't1', name: '社内MTG', workCategory: '打合せ', totalTime: 180 }),
        task({ id: 'b', taskId: 't2', name: '1on1', workCategory: '打合せ', totalTime: 60 }),
      ]

      it('残りを手前のタスクから繰り上げて減算し、0分になったタスクも行に残す', () => {
        const { text } = buildAttendanceText(sessions, '09:00', '12:00', 30)

        expect(text).toBe('勤怠\n09:00 12:00 30\nZZ 社内MTG 打合せ 150\nZZ 1on1 打合せ 0')
      })

      it('hasZeroTask は true', () => {
        const { hasZeroTask } = buildAttendanceText(sessions, '09:00', '12:00', 30)

        expect(hasZeroTask).toBe(true)
      })
    })

    it('超過分が全タスク合計を超える異常時は全タスクを0にクランプする', () => {
      // 09:00〜09:00 - 休憩60 → 実労働-60分。タイマー30分 → 超過90分。タスク0、残60は破棄
      const sessions = [task({ totalTime: 30 })]

      const { text } = buildAttendanceText(sessions, '09:00', '09:00', 60)

      expect(text).toBe('勤怠\n09:00 09:00 60\nZZ テスト作業 設計 0')
    })
  })

  describe('差分調整をしない条件', () => {
    it('出勤・退勤が null なら加算しない', () => {
      const sessions = [task({ totalTime: 180 })]

      const { text } = buildAttendanceText(sessions, null, null, 60)

      expect(text.split('\n').at(-1)).toBe('ZZ テスト作業 設計 180')
    })

    it('出勤時刻が HH:mm 形式でなければ調整しない', () => {
      const sessions = [task({ totalTime: 180 })]

      const { text } = buildAttendanceText(sessions, '9時', '18:00', 60)

      expect(text.split('\n').at(-1)).toBe('ZZ テスト作業 設計 180')
    })
  })
})

describe('calcBreakMinutes', () => {
  it.each([
    ['12:00', '13:00', 60],
    ['12:30', '13:15', 45],
    ['9:00', '9:10', 10],
  ])('%s〜%s は %i 分', (start, end, expected) => {
    const minutes = calcBreakMinutes(start, end)

    expect(minutes).toBe(expected)
  })

  it.each([
    ['終了が null', '12:00', null],
    ['開始が null', null, '13:00'],
    ['両方 null', null, null],
    ['終了が開始より前', '13:00', '12:00'],
    ['終了と開始が同じ', '12:00', '12:00'],
    ['形式が不正', '12時', '13:00'],
  ])('%s なら既定の 60 分', (_label, start, end) => {
    const minutes = calcBreakMinutes(start, end)

    expect(minutes).toBe(60)
  })
})

describe('isValidWorkTime', () => {
  it.each(['09:00', '9:00', '23:59'])('%s は妥当', (value) => {
    const valid = isValidWorkTime(value)

    expect(valid).toBe(true)
  })

  it.each([null, '', '9', '09:0', '0900', '09:00:00', 'ab:cd'])('%s は不正', (value) => {
    const valid = isValidWorkTime(value)

    expect(valid).toBe(false)
  })
})
