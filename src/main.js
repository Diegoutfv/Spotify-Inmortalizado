const { invoke } = window.__TAURI__.core;
const { openUrl } = window.__TAURI__.opener;

const PORT = 8888;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`;
const SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state",
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-private",
  "playlist-modify-public",
  "user-library-read",
  "user-library-modify",
].join(" ");

const $ = (id) => document.getElementById(id);
const ls = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  del: (k) => { try { localStorage.removeItem(k); } catch {} },
};

/* ---------- Iconos (SVG) ---------- */

const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
const REPEAT_D = "M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z";
const ICON = {
  play: svg("M8 5v14l11-7z"),
  pause: svg("M6 5h4v14H6zm8 0h4v14h-4z"),
  prev: svg("M6 6h2v12H6zm3.5 6 8.5 6V6z"),
  next: svg("M16 6h2v12h-2zM6 18l8.5-6L6 6z"),
  shuffle: svg("M10.59 9.17 5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"),
  repeat: svg(REPEAT_D),
  repeatOne: svg(REPEAT_D + "M13 15V9h-1l-2 1v1h1.5v4H13z"),
  heart: svg("M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z"),
  heartFill: svg("M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"),
  logout: svg("M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"),
  pin: svg("M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z"),
};

function setFill(el) {
  el.style.setProperty("--p", `${(el.value / el.max) * 100}%`);
}

/* ---------- Auth (Authorization Code + PKCE) ---------- */

function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function randomString(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return b64url(a).slice(0, n);
}
async function sha256(text) {
  return b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

async function tokenRequest(params) {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || "Error de token");
  ls.set("access_token", data.access_token);
  ls.set("expires_at", String(Date.now() + data.expires_in * 1000));
  if (data.refresh_token) ls.set("refresh_token", data.refresh_token);
}

async function getToken() {
  if (Date.now() > Number(ls.get("expires_at") || 0) - 60_000) {
    await tokenRequest({
      grant_type: "refresh_token",
      refresh_token: ls.get("refresh_token"),
      client_id: ls.get("client_id"),
    });
  }
  return ls.get("access_token");
}

async function login() {
  const clientId = $("clientId").value.trim();
  if (!clientId) return setLoginMsg("Falta el Client ID", true);
  ls.set("client_id", clientId);
  setLoginMsg("Esperando el inicio de sesión en tu navegador…");

  const verifier = randomString(64);
  const state = randomString(16);
  const authUrl = "https://accounts.spotify.com/authorize?" + new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge_method: "S256",
    code_challenge: await sha256(verifier),
    state,
  });

  try {
    const waiting = invoke("wait_for_callback", { port: PORT });
    await openUrl(authUrl);
    const path = await waiting;
    const q = new URL(path, "http://127.0.0.1").searchParams;
    if (q.get("error")) throw new Error(q.get("error"));
    if (q.get("state") !== state) throw new Error("Estado inválido");
    await tokenRequest({
      grant_type: "authorization_code",
      code: q.get("code"),
      redirect_uri: REDIRECT_URI,
      client_id: clientId,
      code_verifier: verifier,
    });
    ls.set("scopes", SCOPES);
    startApp();
  } catch (e) {
    setLoginMsg(String(e.message || e), true);
  }
}

function setLoginMsg(text, isError = false) {
  const el = $("loginMsg");
  el.textContent = text;
  el.classList.toggle("error", isError);
}

function clearTokens() {
  ["access_token", "refresh_token", "expires_at", "scopes"].forEach(ls.del);
}

function logout() {
  clearTokens();
  location.reload();
}

/* ---------- Web API ---------- */

async function api(path, { method = "GET", body } = {}) {
  const url = path.startsWith("http") ? path : "https://api.spotify.com/v1" + path;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: "Bearer " + (await getToken()),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204 || res.status === 202) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error?.message || `Error ${res.status}`);
  return data;
}

// Sigue la paginación ("next") hasta `pages` páginas.
async function fetchAll(path, pages = 4) {
  const out = [];
  let url = path;
  for (let i = 0; i < pages && url; i++) {
    const data = await api(url);
    out.push(...(data?.items || []));
    url = data?.next || null;
  }
  return out;
}

function setStatus(text, isError = false) {
  const el = $("status");
  el.textContent = text;
  el.classList.toggle("error", isError);
}

/* ---------- Listas de canciones (reutilizable) ---------- */

// Los items de playlist pueden venir como {item} (API nueva) o {track} (antigua).
function trackOf(entry) {
  const t = entry?.item || entry?.track || entry;
  return t && t.uri && t.type !== "episode" && !t.is_local ? t : null;
}

function artistNames(t) {
  return (t.artists || []).map((a) => a.name).join(", ");
}

function makeRow({ img, title, subtitle, onClick, action }) {
  const li = document.createElement("li");
  li.className = "row";
  const im = document.createElement("img");
  im.loading = "lazy";
  im.src = img || "";
  const meta = document.createElement("div");
  meta.className = "meta";
  const s = document.createElement("strong");
  s.textContent = title;
  const sp = document.createElement("span");
  sp.textContent = subtitle || "";
  meta.append(s, sp);
  li.append(im, meta);
  if (action) {
    const b = document.createElement("button");
    if (action.html) b.innerHTML = action.html; else b.textContent = action.label;
    b.title = action.title;
    if (action.cls) b.className = action.cls;
    b.addEventListener("click", (e) => { e.stopPropagation(); action.run(); });
    li.append(b);
  }
  li.addEventListener("click", onClick);
  return li;
}

function renderTracks(ul, list, { append = false, context = null } = {}) {
  if (!append) ul.textContent = "";
  const start = append ? ul.children.length : 0;
  list.slice(start).forEach((t, k) => {
    const i = start + k;
    ul.append(makeRow({
      img: t.album?.images?.at(-1)?.url,
      title: t.name,
      subtitle: artistNames(t),
      onClick: () => play(list, i, context),
      action: { label: "＋", title: "Añadir a playlist", run: () => openPicker(t.uri) },
    }));
  });
}

// Con `context` (uri de playlist) Spotify reproduce la playlist completa;
// sin él se envía una ventana de hasta 100 canciones.
async function play(list, index, context = null) {
  if (!deviceId) return setStatus("El reproductor aún se está iniciando…", true);
  try {
    const body = context
      ? { context_uri: context, ...(index != null ? { offset: { uri: list[index].uri } } : {}) }
      : { uris: list.slice(index, index + 100).map((t) => t.uri) };
    await api(`/me/player/play?device_id=${deviceId}`, { method: "PUT", body });
    setStatus("");
  } catch (e) {
    setStatus(e.message, true);
  }
}

async function setShuffle(on) {
  if (!deviceId) return;
  try {
    await api(`/me/player/shuffle?${new URLSearchParams({ state: String(on), device_id: deviceId })}`, { method: "PUT" });
    $("shuffle").classList.toggle("on", on);
    shuffleOn = on;
  } catch (e) {
    setStatus(e.message, true);
  }
}

async function cycleRepeat() {
  if (!deviceId) return;
  const next = ["context", "track", "off"][lastState?.repeat_mode ?? 0] ?? "off";
  // repeat_mode: 0 = off -> context; 1 = context -> track; 2 = track -> off
  try {
    await api(`/me/player/repeat?${new URLSearchParams({ state: next, device_id: deviceId })}`, { method: "PUT" });
  } catch (e) {
    setStatus(e.message, true);
  }
}

/* ---------- Pestañas ---------- */

const VIEWS = ["search", "playlists", "playlist", "library"];
function showView(name) {
  VIEWS.forEach((v) => { $("view-" + v).hidden = v !== name; });
  const tab = name === "playlist" ? "playlists" : name;
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  setStatus("");
}

/* Historial de navegación (botones atrás/adelante del mouse) */
const navStack = [];
let navIdx = -1;

function navPush(entry) {
  navStack.splice(navIdx + 1);
  navStack.push(entry);
  navIdx = navStack.length - 1;
}

function navGo(delta) {
  if (!$("picker").hidden) return;
  const i = navIdx + delta;
  if (i < 0 || i >= navStack.length) return;
  navIdx = i;
  const e = navStack[i];
  if (e.playlist) openPlaylist(e.playlist, true);
  else selectTab(e.tab, true);
}

function selectTab(name, fromHistory = false) {
  if (!fromHistory) navPush({ tab: name });
  showView(name);
  if (name === "playlists") loadPlaylists();
  if (name === "library") loadLibrary();
}

/* ---------- Búsqueda (máx. 10 por página en la API actual) ---------- */

const SEARCH_LIMIT = 10;
let searchTracks = [];
let searchQuery = "";

async function search(query, more = false) {
  if (!more) { searchQuery = query; searchTracks = []; }
  setStatus("Buscando…");
  try {
    const data = await api(`/search?${new URLSearchParams({
      q: searchQuery, type: "track", limit: String(SEARCH_LIMIT), offset: String(searchTracks.length),
    })}`);
    const items = data.tracks.items.filter(Boolean);
    searchTracks.push(...items);
    renderTracks($("results"), searchTracks, { append: more });
    $("more").hidden = !data.tracks.next;
    setStatus(searchTracks.length ? "" : "Sin resultados");
  } catch (e) {
    setStatus(e.message, true);
  }
}

/* ---------- Playlists ---------- */

let me = null;
let myPlaylists = [];

async function loadPlaylists() {
  setStatus("Cargando playlists…");
  try {
    myPlaylists = await fetchAll("/me/playlists?limit=50");
    myPlaylists = myPlaylists.filter(Boolean);
    renderPlaylists();
    setStatus(myPlaylists.length ? "" : "No tienes playlists todavía");
  } catch (e) {
    setStatus(e.message, true);
  }
}

/* Playlists fijadas al inicio (se guardan en el equipo, en el orden en que las fijas) */
const PIN_KEY = "pinned_playlists";

function getPins() {
  try { return JSON.parse(ls.get(PIN_KEY) || "[]"); } catch { return []; }
}

function togglePin(id) {
  const pins = getPins();
  const i = pins.indexOf(id);
  if (i >= 0) pins.splice(i, 1); else pins.push(id);
  ls.set(PIN_KEY, JSON.stringify(pins));
  renderPlaylists();
}

function sectionTitle(text) {
  const li = document.createElement("li");
  li.className = "section-title";
  li.textContent = text;
  return li;
}

function playlistRow(p, pinned) {
  const total = (p.items || p.tracks)?.total;
  return makeRow({
    img: p.images?.[0]?.url,
    title: p.name,
    subtitle: [p.owner?.display_name, total != null ? `${total} canciones` : ""].filter(Boolean).join(" · "),
    onClick: () => openPlaylist(p),
    action: {
      html: ICON.pin,
      title: pinned ? "Quitar de fijadas" : "Fijar al inicio",
      cls: "pin" + (pinned ? " on" : ""),
      run: () => togglePin(p.id),
    },
  });
}

function renderPlaylists() {
  const ul = $("playlists");
  ul.textContent = "";
  const pins = getPins();
  const pinned = pins.map((id) => myPlaylists.find((p) => p.id === id)).filter(Boolean);
  const rest = myPlaylists.filter((p) => !pins.includes(p.id));
  if (pinned.length) {
    ul.append(sectionTitle("Fijadas"));
    pinned.forEach((p) => ul.append(playlistRow(p, true)));
    if (rest.length) ul.append(sectionTitle("Todas"));
  }
  rest.forEach((p) => ul.append(playlistRow(p, false)));
}

let openPl = null; // { uri }

async function openPlaylist(p, fromHistory = false) {
  if (!fromHistory) navPush({ playlist: p });
  showView("playlist");
  openPl = { uri: p.uri };
  $("plTitle").textContent = p.name;
  $("plTracks").textContent = "";
  setStatus("Cargando canciones…");
  try {
    const data = await api(`/playlists/${p.id}/items?limit=50`);
    if (!data?.items) {
      return setStatus("Spotify solo permite ver el contenido de playlists propias o colaborativas.", true);
    }
    let entries = data.items;
    if (data.next) entries = entries.concat(await fetchAll(data.next, 100));
    const list = entries.map(trackOf).filter(Boolean);
    renderTracks($("plTracks"), list, { context: p.uri });
    const skipped = entries.length - list.length;
    setStatus(list.length
      ? (skipped ? `${skipped} elementos no mostrados (archivos locales o podcasts)` : "")
      : "Playlist vacía");
  } catch (e) {
    setStatus(e.message, true);
  }
}

async function createPlaylist(name) {
  try {
    await api("/me/playlists", { method: "POST", body: { name, public: false } });
    $("newPl").value = "";
    await loadPlaylists();
  } catch (e) {
    setStatus(e.message, true);
  }
}

/* ---------- Selector "añadir a playlist" ---------- */

async function openPicker(uri) {
  try {
    if (!me) me = await api("/me");
    if (!myPlaylists.length) myPlaylists = (await fetchAll("/me/playlists?limit=50")).filter(Boolean);
  } catch (e) {
    return setStatus(e.message, true);
  }
  const ul = $("pickerList");
  ul.textContent = "";
  const editable = myPlaylists.filter((p) => p.owner?.id === me.id || p.collaborative);
  if (!editable.length) {
    const li = document.createElement("li");
    li.className = "msg";
    li.textContent = "No tienes playlists editables. Crea una en la pestaña Playlists.";
    ul.append(li);
  }
  editable.forEach((p) => ul.append(makeRow({
    img: p.images?.at(-1)?.url,
    title: p.name,
    onClick: async () => {
      $("picker").hidden = true;
      try {
        await api(`/playlists/${p.id}/items`, { method: "POST", body: { uris: [uri] } });
        setStatus(`Añadida a "${p.name}"`);
      } catch (e) {
        setStatus(e.message, true);
      }
    },
  })));
  $("picker").hidden = false;
}

/* ---------- Biblioteca (canciones que te gustan) ---------- */

async function loadLibrary() {
  setStatus("Cargando tu biblioteca…");
  try {
    const entries = await fetchAll("/me/tracks?limit=50", 100);
    const list = entries.map(trackOf).filter(Boolean);
    renderTracks($("libTracks"), list);
    setStatus(list.length ? "" : "Aún no tienes canciones guardadas");
  } catch (e) {
    setStatus(e.message, true);
  }
}

/* ---------- Me gusta (corazón del reproductor) ---------- */

let currentUri = null;
let liked = false;

function setLiked(v) {
  liked = v;
  $("like").innerHTML = v ? ICON.heartFill : ICON.heart;
  $("like").classList.toggle("on", v);
}

async function refreshLiked(uri) {
  try {
    const res = await api(`/me/library/contains?${new URLSearchParams({ uris: uri })}`);
    if (uri === currentUri) setLiked(!!res?.[0]);
  } catch {
    setLiked(false);
  }
}

async function toggleLike() {
  if (!currentUri) return;
  const next = !liked;
  try {
    await api(`/me/library?${new URLSearchParams({ uris: currentUri })}`, { method: next ? "PUT" : "DELETE" });
    setLiked(next);
  } catch (e) {
    setStatus(e.message, true);
  }
}

/* ---------- Reproductor (Web Playback SDK) ---------- */

let player = null;
let deviceId = null;
let lastState = null;
let seeking = false;
let shuffleOn = false;

// Teclas multimedia de Windows: siguiente / anterior.
// (Play/Pausa ya las maneja Windows de forma nativa con el audio del reproductor.)
async function setupMediaKeys() {
  const gs = window.__TAURI__?.globalShortcut;
  if (!gs) return;
  const bind = async (key, action) => {
    try {
      if (await gs.isRegistered(key)) await gs.unregister(key);
      await gs.register(key, (e) => { if (e.state === "Pressed") action(); });
    } catch (err) {
      console.warn(`No se pudo registrar ${key}:`, err);
    }
  };
  await bind("MediaTrackNext", () => player?.nextTrack());
  await bind("MediaTrackPrevious", () => player?.previousTrack());
}

function initPlayer() {
  window.onSpotifyWebPlaybackSDKReady = () => {
    player = new Spotify.Player({
      name: "Spotify Inmortalizado",
      getOAuthToken: async (cb) => cb(await getToken()),
      volume: Number($("vol").value) / 100,
    });
    player.addListener("ready", ({ device_id }) => {
      deviceId = device_id;
      api("/me/player", { method: "PUT", body: { device_ids: [device_id], play: false } }).catch(() => {});
    });
    player.addListener("player_state_changed", renderState);
    for (const ev of ["initialization_error", "authentication_error", "account_error", "playback_error"]) {
      player.addListener(ev, ({ message }) => setStatus(`${ev}: ${message}`, true));
    }
    player.connect();
    setupMediaKeys();
  };
  const s = document.createElement("script");
  s.src = "https://sdk.scdn.co/spotify-player.js";
  document.head.append(s);
}

function renderState(state) {
  lastState = state;
  if (!state) return;
  const t = state.track_window.current_track;
  $("title").textContent = t.name;
  $("artist").textContent = t.artists.map((a) => a.name).join(", ");
  $("cover").src = t.album.images[0]?.url || "";
  $("toggle").innerHTML = state.paused ? ICON.play : ICON.pause;
  shuffleOn = state.shuffle;
  $("shuffle").classList.toggle("on", state.shuffle);
  $("repeat").classList.toggle("on", state.repeat_mode > 0);
  $("repeat").innerHTML = state.repeat_mode === 2 ? ICON.repeatOne : ICON.repeat;
  if (t.uri !== currentUri) {
    currentUri = t.uri;
    setLiked(false);
    refreshLiked(t.uri);
  }
}

setInterval(() => {
  if (!lastState || seeking) return;
  const pos = lastState.paused ? lastState.position : lastState.position + (Date.now() - lastState.timestamp);
  $("seek").value = lastState.duration ? Math.min(1000, (pos / lastState.duration) * 1000) : 0;
  setFill($("seek"));
}, 500);

/* ---------- Aviso de nueva versión ---------- */

// Se consulta el último release publicado en GitHub y, si es más nuevo que esta versión,
// se muestra un aviso con un enlace para descargarlo. No instala nada por sí solo.
// Si haces un fork, cambia estas dos URL por las de tu repositorio.
const UPDATE_API = "https://api.github.com/repos/Diegoutfv/Spotify-Inmortalizado/releases/latest";
const RELEASES_PAGE = "https://github.com/Diegoutfv/Spotify-Inmortalizado/releases/latest";
const UPDATE_CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

function parseVer(v) {
  return String(v).replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
}

function isNewer(a, b) {
  const x = parseVer(a);
  const y = parseVer(b);
  for (let i = 0; i < 3; i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  }
  return false;
}

async function checkForUpdate() {
  try {
    const current = await window.__TAURI__.app.getVersion();
    let latest = null;
    const cached = JSON.parse(ls.get("update_cache") || "null");
    if (cached && Date.now() - cached.at < UPDATE_CHECK_EVERY_MS) {
      latest = cached.tag;
    } else {
      const res = await fetch(UPDATE_API, { headers: { Accept: "application/vnd.github+json" } });
      if (!res.ok) return;
      latest = (await res.json()).tag_name;
      ls.set("update_cache", JSON.stringify({ tag: latest, at: Date.now() }));
    }
    if (!latest || !isNewer(latest, current) || ls.get("update_dismissed") === latest) return;
    $("updateText").textContent = `Hay una nueva versión: ${latest} (tienes ${current})`;
    $("updateBar").hidden = false;
    $("updateGo").onclick = () => openUrl(RELEASES_PAGE);
    $("updateClose").onclick = () => { ls.set("update_dismissed", latest); $("updateBar").hidden = true; };
  } catch {
    // Sin conexión o límite de GitHub: se ignora en silencio.
  }
}

/* ---------- Arranque ---------- */

function startApp() {
  $("login").hidden = true;
  $("app").hidden = false;
  $("player").hidden = false;
  initPlayer();
  selectTab("playlists");
  checkForUpdate();
}

$("loginBtn").addEventListener("click", login);
$("logout").addEventListener("click", logout);
document.querySelectorAll("#tabs button").forEach((b) => b.addEventListener("click", () => selectTab(b.dataset.tab)));
$("back").addEventListener("click", () => navGo(-1));
$("searchForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = $("q").value.trim();
  if (q) search(q);
});
$("more").addEventListener("click", () => search(searchQuery, true));
$("newPlForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("newPl").value.trim();
  if (name) createPlaylist(name);
});
$("pickerClose").addEventListener("click", () => { $("picker").hidden = true; });
$("like").addEventListener("click", toggleLike);
$("shuffle").addEventListener("click", () => setShuffle(!shuffleOn));
$("repeat").addEventListener("click", cycleRepeat);
$("plPlay").addEventListener("click", async () => {
  if (!openPl) return;
  await setShuffle(false);
  play([], null, openPl.uri);
});
$("plShuffle").addEventListener("click", async () => {
  if (!openPl) return;
  await setShuffle(true);
  play([], null, openPl.uri);
});
$("toggle").addEventListener("click", () => player?.togglePlay());
$("prev").addEventListener("click", () => player?.previousTrack());
$("next").addEventListener("click", () => player?.nextTrack());
$("vol").addEventListener("input", (e) => { setFill(e.target); player?.setVolume(Number(e.target.value) / 100); });
$("seek").addEventListener("input", (e) => { seeking = true; setFill(e.target); });
$("seek").addEventListener("change", (e) => {
  if (lastState) player?.seek((Number(e.target.value) / 1000) * lastState.duration);
  seeking = false;
});

$("shuffle").innerHTML = ICON.shuffle;
$("prev").innerHTML = ICON.prev;
$("toggle").innerHTML = ICON.play;
$("next").innerHTML = ICON.next;
$("repeat").innerHTML = ICON.repeat;
$("like").innerHTML = ICON.heart;
$("logout").innerHTML = ICON.logout;
setFill($("vol"));
setFill($("seek"));

$("clientId").value = ls.get("client_id") || "";
if (ls.get("refresh_token") && ls.get("scopes") === SCOPES) {
  startApp();
} else {
  if (ls.get("refresh_token")) {
    clearTokens();
    setLoginMsg("Se añadieron permisos nuevos (playlists y biblioteca): vuelve a iniciar sesión.");
  }
  $("login").hidden = false;
}

// Botones laterales del mouse: 4.º = atrás, 5.º = adelante (e.button 3 y 4).
for (const type of ["mousedown", "mouseup"]) {
  window.addEventListener(type, (e) => {
    if (e.button !== 3 && e.button !== 4) return;
    e.preventDefault();
    if (type === "mouseup") navGo(e.button === 3 ? -1 : 1);
  });
}

// Guía de bienvenida: abrir dashboard y copiar el Redirect URI
$("openDash").addEventListener("click", (e) => { e.preventDefault(); openUrl("https://developer.spotify.com/dashboard"); });
$("copyUri").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(REDIRECT_URI); $("copyUri").textContent = "¡Copiado!"; } catch { $("copyUri").textContent = "Cópialo a mano"; }
  setTimeout(() => { $("copyUri").textContent = "Copiar"; }, 1500);
});