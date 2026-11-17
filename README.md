# Spotify Inmortalizado

Reproductor de escritorio **ligero** para Spotify Premium, hecho con [Tauri](https://tauri.app) y JavaScript puro (sin frameworks). Pesa unos pocos MB y usa muy poca RAM.

> Proyecto no oficial, no afiliado ni respaldado por Spotify AB. "Spotify" es marca de su propietario.

## Funciones

- Playlists propias y colaborativas (con todas sus canciones), reproducción normal o aleatoria
- Canciones que te gustan (biblioteca) y botón de corazón
- Búsqueda de canciones
- Crear playlists y añadir canciones
- Controles: play/pausa, anterior/siguiente, aleatorio, repetir, volumen y progreso
- Playlists fijadas al inicio y navegación con los botones laterales del mouse
- Teclas multimedia (siguiente/anterior) que funcionan incluso con un juego en primer plano, y panel multimedia de Windows con canción y portada
- Aviso cuando hay una versión nueva publicada en GitHub
- Inicio de sesión seguro con OAuth **PKCE** (sin backend ni secretos)

## Requisitos

- **Windows 10/11** (usa WebView2, que ya incluye el DRM necesario para reproducir)
- Cuenta de **Spotify Premium** (obligatorio para el reproductor de Spotify)
- [Node.js](https://nodejs.org) LTS
- [Rust](https://rustup.rs) y las *Build Tools de Visual Studio* con "Desarrollo para el escritorio con C++"

## 1. Crea tu app en Spotify (2 minutos)

Cada persona usa **su propio Client ID** (no hay claves compartidas):

1. Entra al [Dashboard de Spotify for Developers](https://developer.spotify.com/dashboard) y pulsa **Create app**.
2. Marca **Web API** y **Web Playback SDK**.
3. En **Redirect URIs** añade exactamente `http://127.0.0.1:8888/callback` (Spotify solo acepta `http` con `127.0.0.1`).
4. Guarda y copia el **Client ID** desde *Settings*. El Client Secret no se necesita.

## 2. Ejecuta la app

```bash
npm install
npm run tauri dev
```

> En PowerShell, si `npm` da error de "ejecución de scripts deshabilitada", usa `npm.cmd`.
> Si la compilación falla por bloqueo de archivos (antivirus, rutas largas), apunta la salida a una carpeta corta:
> `$env:CARGO_TARGET_DIR="C:\cargo-target\inmortalizado"`

La primera compilación tarda unos minutos. Al abrir la ventana, pega tu Client ID e inicia sesión.

Para generar un instalador: `npm run tauri build`.

## Limitaciones de Spotify (modo desarrollo)

Las apps nuevas están en *Development mode*:

- El dueño de la app debe tener Premium y solo se permiten unos pocos usuarios por app (añádelos en **User Management** del dashboard).
- Desde febrero 2026 solo se puede ver el contenido de playlists **propias o colaborativas**.
- La búsqueda devuelve 10 resultados por página.

Consulta la [guía de migración](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide) para más detalles.

## Privacidad

El Client ID y los tokens se guardan solo en el almacenamiento local de la app en tu equipo. No hay servidores intermedios: la app habla directamente con Spotify.