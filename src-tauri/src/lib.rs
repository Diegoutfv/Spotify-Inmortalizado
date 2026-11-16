use std::io::{Read, Write};
use std::net::TcpListener;
use std::time::{Duration, Instant};

/// Abre un servidor local temporal y espera el redirect de Spotify (/callback?code=...).
/// Devuelve la ruta con su query string para que el frontend extraiga el código.
#[tauri::command]
async fn wait_for_callback(port: u16) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        let listener = TcpListener::bind(("127.0.0.1", port))
            .map_err(|e| format!("No se pudo abrir el puerto {port}: {e}"))?;
        listener.set_nonblocking(true).map_err(|e| e.to_string())?;
        let deadline = Instant::now() + Duration::from_secs(180);

        loop {
            if Instant::now() > deadline {
                return Err("Tiempo de espera agotado para el inicio de sesión".into());
            }
            match listener.accept() {
                Ok((mut stream, _)) => {
                    stream.set_nonblocking(false).ok();
                    stream.set_read_timeout(Some(Duration::from_secs(2))).ok();
                    let mut buf = [0u8; 4096];
                    let n = stream.read(&mut buf).unwrap_or(0);
                    let req = String::from_utf8_lossy(&buf[..n]);
                    let path = req
                        .lines()
                        .next()
                        .and_then(|l| l.split_whitespace().nth(1))
                        .unwrap_or("")
                        .to_string();

                    let body = "<!doctype html><meta charset=utf-8><body style=\"font-family:sans-serif;background:#121212;color:#fff;text-align:center;padding-top:20vh\"><h2>Listo, ya puedes volver a Spotify Inmortalizado.</h2>";
                    let resp = format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        body.len(),
                        body
                    );
                    let _ = stream.write_all(resp.as_bytes());

                    if path.starts_with("/callback") {
                        return Ok(path);
                    }
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(100));
                }
                Err(e) => return Err(e.to_string()),
            }
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![wait_for_callback])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
