// Tauri 用エントリ。electronAPI シムを「レンダラーより先」に評価して window.electronAPI を
// 用意してから、既存レンダラー(frontend/renderer/src/main.tsx)を起動する。
import "./electron-api-shim";
import "@/main";
