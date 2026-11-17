//! Integración nativa con los controles multimedia de Windows (SMTC).
//!
//! Es el panel que aparece al cambiar de canción o subir el volumen: muestra título, artista y
//! portada, y sus botones (play/pausa/siguiente/anterior) llegan a la app como eventos `media-key`.
use std::sync::{mpsc, OnceLock};

use tauri::{AppHandle, Emitter};
use windows::{
    core::{factory, HSTRING},
    Foundation::{TypedEventHandler, Uri},
    Media::{
        MediaPlaybackStatus, MediaPlaybackType, SystemMediaTransportControls,
        SystemMediaTransportControlsButton, SystemMediaTransportControlsButtonPressedEventArgs,
    },
    Storage::Streams::RandomAccessStreamReference,
    Win32::{
        Foundation::HWND,
        System::{
            Com::{CoInitializeEx, COINIT_MULTITHREADED},
            WinRT::ISystemMediaTransportControlsInterop,
        },
    },
};

pub struct Update {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub cover: String,
    pub playing: bool,
}

static TX: OnceLock<mpsc::Sender<Update>> = OnceLock::new();

/// Envía el estado actual al hilo que maneja el panel de Windows.
pub fn send(update: Update) {
    if let Some(tx) = TX.get() {
        let _ = tx.send(update);
    }
}

fn create(hwnd: isize, app: &AppHandle) -> windows::core::Result<SystemMediaTransportControls> {
    let interop = factory::<SystemMediaTransportControls, ISystemMediaTransportControlsInterop>()?;
    let smtc: SystemMediaTransportControls =
        unsafe { interop.GetForWindow(HWND(hwnd as *mut _))? };

    smtc.SetIsEnabled(true)?;
    smtc.SetIsPlayEnabled(true)?;
    smtc.SetIsPauseEnabled(true)?;
    smtc.SetIsNextEnabled(true)?;
    smtc.SetIsPreviousEnabled(true)?;

    let app = app.clone();
    smtc.ButtonPressed(&TypedEventHandler::<
        SystemMediaTransportControls,
        SystemMediaTransportControlsButtonPressedEventArgs,
    >::new(move |_, args| {
        if let Some(args) = args.as_ref() {
            let name = match args.Button()? {
                SystemMediaTransportControlsButton::Next => "next",
                SystemMediaTransportControlsButton::Previous => "prev",
                SystemMediaTransportControlsButton::Play => "play",
                SystemMediaTransportControlsButton::Pause => "pause",
                _ => return Ok(()),
            };
            let _ = app.emit("media-key", name);
        }
        Ok(())
    }))?;

    Ok(smtc)
}

fn apply_metadata(smtc: &SystemMediaTransportControls, u: &Update) -> windows::core::Result<()> {
    let updater = smtc.DisplayUpdater()?;
    updater.SetType(MediaPlaybackType::Music)?;
    let music = updater.MusicProperties()?;
    music.SetTitle(&HSTRING::from(u.title.as_str()))?;
    music.SetArtist(&HSTRING::from(u.artist.as_str()))?;
    music.SetAlbumTitle(&HSTRING::from(u.album.as_str()))?;
    if !u.cover.is_empty() {
        if let Ok(uri) = Uri::CreateUri(&HSTRING::from(u.cover.as_str())) {
            if let Ok(stream) = RandomAccessStreamReference::CreateFromUri(&uri) {
                updater.SetThumbnail(&stream)?;
            }
        }
    }
    updater.Update()
}

/// Crea el panel de Windows para la ventana indicada, en un hilo propio con COM inicializado.
pub fn start(app: AppHandle, hwnd: isize) {
    let (tx, rx) = mpsc::channel::<Update>();
    if TX.set(tx).is_err() {
        return;
    }
    std::thread::spawn(move || {
        let _ = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
        let Ok(smtc) = create(hwnd, &app) else {
            return;
        };
        let mut last = String::new();
        while let Ok(u) = rx.recv() {
            let key = format!("{}|{}|{}", u.title, u.artist, u.cover);
            if key != last && apply_metadata(&smtc, &u).is_ok() {
                last = key;
            }
            let _ = smtc.SetPlaybackStatus(if u.playing {
                MediaPlaybackStatus::Playing
            } else {
                MediaPlaybackStatus::Paused
            });
        }
    });
}
