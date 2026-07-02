// Tauri 用エントリ。bridge を「レンダラーより先」に評価して window.bridge を
// 用意してから、既存レンダラー(frontend/renderer/src/main.tsx)を起動する。
import "./bridge";
import "@/main";
