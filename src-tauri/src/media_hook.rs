//! Gancho de teclado a nivel de sistema para las teclas multimedia (siguiente / anterior).
//!
//! Los atajos globales de Windows no se activan cuando un juego tiene el control del teclado.
//! Un gancho de bajo nivel (WH_KEYBOARD_LL) ve la pulsación antes que el juego. No bloquea la
//! tecla: sigue su camino normal, así que la pausa nativa continúa funcionando igual.
use std::{ptr, sync::OnceLock};

use tauri::{AppHandle, Emitter};
use windows_sys::Win32::{
    Foundation::{LPARAM, LRESULT, WPARAM},
    System::LibraryLoader::GetModuleHandleW,
    UI::WindowsAndMessaging::{
        CallNextHookEx, DispatchMessageW, GetMessageW, SetWindowsHookExW, TranslateMessage,
        KBDLLHOOKSTRUCT, MSG, WH_KEYBOARD_LL, WM_KEYDOWN, WM_SYSKEYDOWN,
    },
};

static APP: OnceLock<AppHandle> = OnceLock::new();

const VK_MEDIA_NEXT_TRACK: u32 = 0xB0;
const VK_MEDIA_PREV_TRACK: u32 = 0xB1;

unsafe extern "system" fn keyboard_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 && (wparam as u32 == WM_KEYDOWN || wparam as u32 == WM_SYSKEYDOWN) {
        let info = unsafe { &*(lparam as *const KBDLLHOOKSTRUCT) };
        let which = match info.vkCode {
            VK_MEDIA_NEXT_TRACK => Some("next"),
            VK_MEDIA_PREV_TRACK => Some("prev"),
            _ => None,
        };
        if let (Some(which), Some(app)) = (which, APP.get()) {
            let _ = app.emit("media-key", which);
        }
    }
    unsafe { CallNextHookEx(ptr::null_mut(), code, wparam, lparam) }
}

/// Instala el gancho en un hilo propio (necesita su propio bucle de mensajes).
pub fn start(app: AppHandle) {
    if APP.set(app).is_err() {
        return;
    }
    std::thread::spawn(|| unsafe {
        let hook = SetWindowsHookExW(
            WH_KEYBOARD_LL,
            Some(keyboard_proc),
            GetModuleHandleW(ptr::null()),
            0,
        );
        if hook.is_null() {
            return;
        }
        let mut msg: MSG = std::mem::zeroed();
        while GetMessageW(&mut msg, ptr::null_mut(), 0, 0) > 0 {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    });
}
