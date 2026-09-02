/* ============================================================
   Caveira Mix — App principal (ES6)
   ============================================================ */
const CFG = window.CAVEIRA_CONFIG;
const $ = (id) => document.getElementById(id);

/* ---------- Elementos ---------- */
const audio = $("audio");
const btnPlay = $("btn-play");
const volume = $("volume");
const disc = $("disc");
const discCover = $("disc-cover");
const equalizer = $("equalizer");
const elTitle = $("track-title");
const elArtist = $("track-artist");
const elAlbum = $("track-album");
const elListeners = $("listeners");
const elStatus = $("player-status");
const elHistory = $("history");

let isPlaying = false;
let lastTrackKey = "";

/* ============================================================
   LIVE STREAM MANAGER
   Resolve: atraso progressivo, cortes/engasgos, desync após suspensão
   ============================================================ */
const LIVE_LAG_THRESHOLD_SEC = 8;   // segundos de atraso antes de forçar ressincronização
const LIVE_LAG_CHECK_MS     = 5000; // intervalo de checagem de latência
const LIVE_STALL_TIMEOUT_MS = 8000; // ms sem progresso antes de reconectar
const LIVE_ERROR_RETRY_MS   = 3000; // ms antes de retentar após erro
const LIVE_MAX_RETRIES       = 5;   // tentativas antes de desistir

let lsmRetries       = 0;
let lsmStallTimer    = null;
let lsmLagTimer      = null;
let lsmReconnecting  = false;
let lsmLastTime      = 0;
let lsmLastTimeTs    = 0;

/** Cria (ou recria) o src do stream, descarregando todo o buffer anterior */
function lsmLoadSource() {
  const url = CFG.STREAM_URL;
  if (url.endsWith(".m3u8") && window.Hls && window.Hls.isSupported()) {
    // Para HLS, destrói a instância antiga e cria uma nova
    if (window.__lsmHls) { try { window.__lsmHls.destroy(); } catch(_) {} }
    const hls = new window.Hls({
      lowLatencyMode: true,
      backBufferLength: 4,         // descartar buffer atrás
      maxBufferLength: 10,         // nunca acumular mais que 10 s
      maxMaxBufferLength: 20,
    });
    window.__lsmHls = hls;
    hls.loadSource(url);
    hls.attachMedia(audio);
  } else {
    // MP3/AAC: força flush completo do buffer nativo
    const savedVol = audio.volume;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    // Adiciona cache-buster para evitar que o browser devolva bytes cacheados
    audio.src = url + (url.includes("?") ? "&" : "?") + "_t=" + Date.now();
    audio.volume = savedVol;
    audio.load();
  }
}

function lsmSetStatus(msg) {
  if (elStatus) elStatus.textContent = msg;
}

function lsmClearStallTimer() {
  if (lsmStallTimer) { clearTimeout(lsmStallTimer); lsmStallTimer = null; }
}

function lsmArmStallTimer() {
  lsmClearStallTimer();
  lsmStallTimer = setTimeout(() => {
    if (isPlaying) {
      lsmSetStatus("Reconectando…");
      lsmReconnect();
    }
  }, LIVE_STALL_TIMEOUT_MS);
}

async function lsmReconnect() {
  if (lsmReconnecting) return;
  if (lsmRetries >= LIVE_MAX_RETRIES) {
    lsmSetStatus("⚠️ Sem sinal. Recarregue a página.");
    return;
  }
  lsmReconnecting = true;
  lsmRetries++;
  lsmClearStallTimer();
  lsmSetStatus(`Reconectando… (${lsmRetries}/${LIVE_MAX_RETRIES})`);

  try {
    lsmLoadSource();
    await new Promise(r => setTimeout(r, LIVE_ERROR_RETRY_MS));
    await audio.play();
    lsmRetries = 0;
    lsmReconnecting = false;
    lsmSetStatus("");
    vmu.ensureInit(audio);
  } catch(_) {
    lsmReconnecting = false;
    if (isPlaying) setTimeout(lsmReconnect, LIVE_ERROR_RETRY_MS);
  }
}

/** Verifica latência em relação ao ponto mais à frente do buffer e corrige */
function lsmCheckLag() {
  if (!isPlaying || audio.readyState < 2) return;
  try {
    const sb = audio.seekable;
    if (sb && sb.length > 0) {
      const liveEdge = sb.end(sb.length - 1);
      const lag = liveEdge - audio.currentTime;
      if (lag > LIVE_LAG_THRESHOLD_SEC) {
        // Tenta pular para a borda ao vivo (mais eficiente que reconectar)
        audio.currentTime = liveEdge - 0.5;
        lsmSetStatus("");
      }
    }
  } catch(_) {}
}

function lsmStartLagWatcher() {
  if (lsmLagTimer) clearInterval(lsmLagTimer);
  lsmLagTimer = setInterval(lsmCheckLag, LIVE_LAG_CHECK_MS);
}
function lsmStopLagWatcher() {
  if (lsmLagTimer) { clearInterval(lsmLagTimer); lsmLagTimer = null; }
}

/* ---- Eventos do elemento <audio> ---- */
audio.addEventListener("playing", () => {
  lsmSetStatus("");
  lsmRetries = 0;
  lsmReconnecting = false;
  lsmClearStallTimer();
  lsmLastTime = audio.currentTime;
  lsmLastTimeTs = Date.now();
});

audio.addEventListener("waiting", () => {
  if (isPlaying) lsmArmStallTimer();
});

audio.addEventListener("stalled", () => {
  if (isPlaying) {
    lsmSetStatus("Bufferizando…");
    lsmArmStallTimer();
  }
});

audio.addEventListener("error", () => {
  if (isPlaying) {
    lsmSetStatus("Reconectando…");
    lsmReconnect();
  }
});

// Detecta travamento de currentTime (stream congelado sem disparar stalled)
audio.addEventListener("timeupdate", () => {
  const now = Date.now();
  if (audio.currentTime !== lsmLastTime) {
    lsmLastTime = audio.currentTime;
    lsmLastTimeTs = now;
    lsmClearStallTimer();
  } else if (isPlaying && (now - lsmLastTimeTs) > LIVE_STALL_TIMEOUT_MS) {
    lsmArmStallTimer();
  }
});

/* ---- Detecção de retorno do sleep / aba reativada ---- */
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && isPlaying) {
    // Verifica quanto tempo a aba ficou oculta
    const elapsed = Date.now() - lsmLastTimeTs;
    if (elapsed > 4000) {
      // O browser ficou parado; forçar re-sincronização com o ao vivo
      lsmSetStatus("Sincronizando com o ao vivo…");
      lsmLoadSource();
      setTimeout(async () => {
        try {
          await audio.play();
          lsmSetStatus("");
          vmu.ensureInit(audio);
        } catch(_) { lsmReconnect(); }
      }, 500);
    } else {
      lsmCheckLag();
    }
  }
});

/* ---- API pública do player ---- */
function updatePlayButtonUI() {
  btnPlay.textContent = isPlaying ? "⏸" : "▶";
  const stickyBtn = $("sticky-btn-play");
  if (stickyBtn) stickyBtn.textContent = isPlaying ? "⏸" : "▶";
}

function play() {
  lsmRetries = 0;
  lsmReconnecting = false;
  if (!audio.src || audio.src === window.location.href) lsmLoadSource();
  audio.play().then(() => {
    isPlaying = true;
    updatePlayButtonUI();
    disc.classList.add("playing");
    equalizer.classList.add("active");
    lsmSetStatus("");
    lsmStartLagWatcher();
    vmu.ensureInit(audio);
  }).catch(() => {
    lsmSetStatus("Não foi possível iniciar. Toque no botão novamente.");
  });
}

function pause() {
  audio.pause();
  isPlaying = false;
  updatePlayButtonUI();
  disc.classList.remove("playing");
  equalizer.classList.remove("active");
  lsmStopLagWatcher();
  lsmClearStallTimer();
}

btnPlay.addEventListener("click", () => (isPlaying ? pause() : play()));
volume.addEventListener("input", () => {
  const v = volume.value;
  audio.volume = v / 100;
  const sv = $("sticky-volume");
  if (sv) sv.value = v;
});
audio.volume = volume.value / 100;

// Sticky Player listeners
const stickyBtn = $("sticky-btn-play");
if (stickyBtn) stickyBtn.addEventListener("click", () => (isPlaying ? pause() : play()));

const stickyVol = $("sticky-volume");
if (stickyVol) {
  stickyVol.addEventListener("input", () => {
    const v = stickyVol.value;
    audio.volume = v / 100;
    if (volume) volume.value = v;
  });
}

const stickyScrollTop = $("sticky-scroll-top");
if (stickyScrollTop) {
  stickyScrollTop.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

// Pré-carrega a URL sem iniciar reprodução (readyState fica em HAVE_NOTHING até play())
lsmLoadSource();

/* ============================================================
   VMU — Visual Music Unit (Web Audio + Canvas)
   ============================================================ */
class RadioVMU {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.bars = 64;
    this.colors = ["#ff0040", "#ff00ff", "#00ffff", "#00ff41", "#ffff00"];
    this.initialized = false;
    this.data = null;
    this.resize();
    addEventListener("resize", () => this.resize());
    this.animate();
  }
  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(200, r.width);
    this.canvas.height = Math.max(60, r.height);
  }
  ensureInit(audioEl) {
    if (this.initialized) {
      if (this.audioCtx && this.audioCtx.state === "suspended") this.audioCtx.resume();
      return;
    }
    try {
      if (window.CAVEIRA_EQ && typeof window.CAVEIRA_EQ.init === "function") {
        const eqRes = window.CAVEIRA_EQ.init(audioEl);
        if (eqRes && eqRes.audioCtx && eqRes.analyser) {
          this.audioCtx = eqRes.audioCtx;
          this.analyser = eqRes.analyser;
          this.data = new Uint8Array(this.analyser.frequencyBinCount);
          this.initialized = true;
          return;
        }
      }

      const AC = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AC();
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.82;
      this.data = new Uint8Array(this.analyser.frequencyBinCount);
      const src = this.audioCtx.createMediaElementSource(audioEl);
      src.connect(this.analyser);
      this.analyser.connect(this.audioCtx.destination);
      this.initialized = true;
    } catch (e) {
      // CORS ou navegador incompatível — mantém animação idle
      this.initialized = "fallback";
    }
  }
  animate() {
    const { ctx, canvas, bars, colors } = this;
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    let arr;
    if (this.analyser && this.data) {
      this.analyser.getByteFrequencyData(this.data);
      arr = this.data;
    } else {
      // idle: onda suave animada
      const t = performance.now() / 500;
      arr = new Uint8Array(bars);
      for (let i = 0; i < bars; i++) arr[i] = 40 + Math.abs(Math.sin(t + i * 0.35)) * 60;
    }

    const bw = w / bars;
    for (let i = 0; i < bars; i++) {
      const v = arr[i] || 0;
      const bh = (v / 255) * h * 0.92;
      const x = i * bw;
      const y = h - bh;
      const c1 = colors[Math.floor((i / bars) * colors.length) % colors.length];
      const c2 = colors[(Math.floor((i / bars) * colors.length) + 1) % colors.length];
      const grad = ctx.createLinearGradient(x, y, x, h);
      grad.addColorStop(0, c1);
      grad.addColorStop(1, c2);
      ctx.shadowColor = c1;
      ctx.shadowBlur = 18;
      ctx.fillStyle = grad;
      ctx.fillRect(x + 1, y, Math.max(1, bw - 2), bh);
      // brilho topo
      ctx.shadowBlur = 26;
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(x + 1, y, Math.max(1, bw - 2), 2);
    }
    ctx.shadowBlur = 0;
    requestAnimationFrame(() => this.animate());
  }
}
const vmu = new RadioVMU($("vmu-canvas"));

/* ============================================================
   COVER FINDER — cache com TTL, normalização, paralelo com timeout
   ============================================================ */
const COVER_CACHE_KEY = "cav_cover_cache_v1";
const COVER_TTL_MS = (CFG.COVER_CACHE_TTL_DAYS || 7) * 24 * 60 * 60 * 1000;

function loadCoverCache() {
  try { return JSON.parse(localStorage.getItem(COVER_CACHE_KEY) || "{}"); } catch { return {}; }
}
function saveCoverCache(obj) {
  try { localStorage.setItem(COVER_CACHE_KEY, JSON.stringify(obj)); } catch {}
}
const coverCache = loadCoverCache();

const NORMALIZE_PATTERNS = [
  /\(official\s*(music\s*)?video\)/gi, /\(official\s*audio\)/gi, /\(v[ií]deo\s*oficial\)/gi,
  /\(ao\s*vivo\)/gi, /\(live\)/gi, /\(remaster(ed)?\)/gi, /\(\d{4}\)/g,
  /\[hd\]/gi, /\[4k\]/gi, /\[lyrics?\]/gi, /\[audio\]/gi,
  /visualizer/gi, /lyric\s*video/gi, /official/gi,
  /\bfeat\.?\b/gi, /\bft\.?\b/gi, /\bfeaturing\b/gi,
];
function normalize(artist, title) {
  let a = (artist || "").trim();
  let t = (title || "").trim();
  NORMALIZE_PATTERNS.forEach((p) => { t = t.replace(p, ""); });
  t = t.replace(/\s+/g, " ").trim();
  return { artist: a, title: t };
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then((v) => { clearTimeout(to); resolve(v); }, (e) => { clearTimeout(to); reject(e); });
  });
}

/* JSONP helper (Deezer) */
function jsonp(url, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const cb = "cav_cb_" + Math.random().toString(36).slice(2);
    const sep = url.includes("?") ? "&" : "?";
    const s = document.createElement("script");
    const timer = setTimeout(() => { cleanup(); reject(new Error("timeout")); }, timeoutMs);
    function cleanup() { clearTimeout(timer); delete window[cb]; s.remove(); }
    window[cb] = (data) => { cleanup(); resolve(data); };
    s.src = `${url}${sep}output=jsonp&callback=${cb}`;
    s.onerror = () => { cleanup(); reject(new Error("jsonp error")); };
    document.body.appendChild(s);
  });
}

async function providerDeezer(artist, title) {
  const d = await jsonp(`https://api.deezer.com/search?q=${encodeURIComponent(artist + " " + title)}&limit=1`, 2500);
  const a = d?.data?.[0]?.album;
  return a?.cover_xl || a?.cover_big || null;
}
async function providerITunes(artist, title) {
  const d = await fetch(`https://itunes.apple.com/search?media=music&limit=1&term=${encodeURIComponent(artist + " " + title)}`).then((r) => r.json());
  const url = d?.results?.[0]?.artworkUrl100;
  return url ? url.replace(/100x100bb/, "600x600bb") : null;
}
async function providerMusicBrainz(artist, title) {
  const mb = await fetch(`https://musicbrainz.org/ws/2/release/?query=${encodeURIComponent(`artist:${artist} AND release:${title}`)}&fmt=json&limit=1`).then((r) => r.json());
  const mbid = mb?.releases?.[0]?.id;
  if (!mbid) return null;
  const caa = `https://coverartarchive.org/release/${mbid}/front-500`;
  const ok = await fetch(caa, { method: "HEAD" }).then((r) => r.ok).catch(() => false);
  return ok ? caa : null;
}
async function providerLastFM(artist, title) {
  if (!CFG.LASTFM_API_KEY) return null;
  const d = await fetch(`https://ws.audioscrobbler.com/2.0/?method=track.getInfo&api_key=${CFG.LASTFM_API_KEY}&artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(title)}&format=json`).then((r) => r.json());
  const imgs = d?.track?.album?.image || [];
  const large = imgs.reverse().find((i) => i["#text"]);
  return large ? large["#text"] : null;
}

async function fetchCover(artist, title, fallbackArt) {
  const norm = normalize(artist, title);
  const key = `${norm.artist.toLowerCase()}|${norm.title.toLowerCase()}`;
  const now = Date.now();
  const cached = coverCache[key];
  if (cached && cached.url && (now - cached.t) < COVER_TTL_MS) return cached.url;

  if (fallbackArt && !/logo\.png$/i.test(fallbackArt)) {
    coverCache[key] = { url: fallbackArt, t: now };
    saveCoverCache(coverCache);
    return fallbackArt;
  }

  const providers = [
    () => providerDeezer(norm.artist, norm.title),
    () => providerITunes(norm.artist, norm.title),
    () => providerLastFM(norm.artist, norm.title),
    () => providerMusicBrainz(norm.artist, norm.title),
  ];
  const attempts = providers.map((fn) => withTimeout(fn(), 2200).catch(() => null));
  const results = await Promise.all(attempts);
  const url = results.find((u) => !!u) || fallbackArt || "/live/assets/logo.png";
  coverCache[key] = { url, t: now };
  saveCoverCache(coverCache);
  return url;
}

let trackProgressState = { duration: 0, elapsed: 0, fetchTime: Date.now() };

function formatSec(sec) {
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60);
  return `${m < 10 ? "0" + m : m}:${s < 10 ? "0" + s : s}`;
}

function tickProgressBar() {
  const wrap = $("track-progress-wrap");
  const stickyWrap = $("sticky-progress-wrap");
  if (!trackProgressState.duration || trackProgressState.duration <= 0) {
    if (wrap) wrap.style.display = "none";
    if (stickyWrap) stickyWrap.style.display = "none";
    return;
  }
  if (wrap) wrap.style.display = "block";
  if (stickyWrap) stickyWrap.style.display = "flex";

  const diff = Math.floor((Date.now() - trackProgressState.fetchTime) / 1000);
  const curElapsed = Math.min(trackProgressState.duration, Math.max(0, trackProgressState.elapsed + diff));
  const pct = Math.min(100, Math.max(0, (curElapsed / trackProgressState.duration) * 100));

  const fill = $("track-progress-fill");
  if (fill) fill.style.width = pct + "%";

  const elElap = $("track-time-elapsed");
  if (elElap) elElap.textContent = formatSec(curElapsed);

  const elTot = $("track-time-total");
  if (elTot) elTot.textContent = formatSec(trackProgressState.duration);

  const stickyFill = $("sticky-progress-fill");
  if (stickyFill) stickyFill.style.width = pct + "%";

  const stickyTime = $("sticky-time");
  if (stickyTime) stickyTime.textContent = `${formatSec(curElapsed)} / ${formatSec(trackProgressState.duration)}`;
}

setInterval(tickProgressBar, 1000);

/* ============================================================
   AZURACAST NOW PLAYING
   ============================================================ */
async function updateNowPlaying() {
  try {
    const res = await fetch(CFG.NOWPLAYING_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("bad status");
    const data = await res.json();

    const np = data.now_playing?.song || {};
    const artist = np.artist || "Caveira Mix";
    const title = np.title || "Ao Vivo";
    const album = np.album || "";
    const fallbackArt = np.art || "";

    const duration = data.now_playing?.duration || 0;
    const elapsed = data.now_playing?.elapsed || 0;
    trackProgressState.duration = duration;
    trackProgressState.elapsed = elapsed;
    trackProgressState.fetchTime = Date.now();
    tickProgressBar();

    const azuraListeners = data.listeners?.current ?? data.listeners?.total ?? 0;
    const currentGlobalMapListeners = parseInt(document.getElementById("map-stat-total")?.textContent) || 0;
    // Usa a contagem de ouvintes do mapa em tempo real se for maior/disponível, senão usa do AzuraCast
    const finalListeners = Math.max(azuraListeners, currentGlobalMapListeners);
    if (elListeners) {
      elListeners.textContent = finalListeners;
      elListeners.style.animation = "none"; void elListeners.offsetWidth; elListeners.style.animation = "";
    }

    $("status-online").textContent = data.is_online === false ? "OFFLINE" : "ONLINE";

    const stickyTitle = $("sticky-title");
    if (stickyTitle) stickyTitle.textContent = title;
    const stickyArtist = $("sticky-artist");
    if (stickyArtist) stickyArtist.textContent = artist;

    const key = `${artist}-${title}`;
    if (key !== lastTrackKey) {
      lastTrackKey = key;
      elTitle.textContent = title;
      elArtist.textContent = artist;
      elAlbum.textContent = album ? `💿 ${album}` : "";
      document.title = `▶ ${title} — ${artist} | Caveira Mix`;

      const cover = await fetchCover(artist, title, fallbackArt);
      discCover.src = cover;

      const stickyCover = $("sticky-cover");
      if (stickyCover) stickyCover.src = cover;

      loadArtistInfo(artist);
    }

    // Expõe dados reais ao módulo do mapa (feed ao vivo usa isso)
    window.CAVEIRA_NOWPLAYING = {
      artist,
      title,
      album,
      listeners,
      isOnline: data.is_online !== false,
      history: (data.song_history || []).slice(0, 5).map((h) => ({
        artist: h.song?.artist || "",
        title: h.song?.title || "",
      })),
    };

    renderPlayingNext(data.playing_next);
    renderHistory(data.song_history || []);
    elStatus.textContent = isPlaying ? "" : elStatus.textContent;
  } catch (err) {
    elStatus.textContent = "⚠️ Não foi possível conectar à rádio. Tentando novamente…";
    if (!elHistory.dataset.loaded) {
      elHistory.innerHTML = '<p class="muted">Histórico indisponível no momento.</p>';
    }
  }
}

let lastNextKey = "";
async function renderPlayingNext(pn) {
  const box = $("next-track-box");
  if (!box) return;

  const song = pn?.song;
  if (!song || (!song.title && !song.artist)) {
    box.style.display = "none";
    return;
  }

  const artist = song.artist || "Caveira Mix";
  const title = song.title || "A definir";
  const fallbackArt = song.art || "";
  const key = `${artist}-${title}`;

  box.style.display = "flex";

  if (key !== lastNextKey) {
    lastNextKey = key;
    const elNextTitle = $("next-track-title");
    const elNextArtist = $("next-track-artist");
    if (elNextTitle) elNextTitle.textContent = title;
    if (elNextArtist) elNextArtist.textContent = artist;

    const cover = await fetchCover(artist, title, fallbackArt);
    const coverEl = $("next-track-cover");
    if (coverEl) {
      coverEl.src = cover;
      coverEl.onerror = () => { coverEl.src = "/live/assets/logo.png"; };
    }
  }

  const timeEl = $("next-track-time");
  if (timeEl) {
    let extra = "";
    if (pn.is_request) {
      extra = "⭐ Pedido de Ouvinte";
    } else if (pn.playlist) {
      extra = `📻 ${pn.playlist}`;
    } else if (pn.played_at) {
      extra = `🕒 ${new Date(pn.played_at * 1000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
    }
    timeEl.textContent = extra;
  }
}

let lastHistoryHTML = "";
async function renderHistory(history) {
  const items = history.slice(0, 10);
  if (!items.length) return;
  elHistory.dataset.loaded = "1";
  const cards = await Promise.all(items.map(async (h) => {
    const s = h.song || {};
    const artist = s.artist || "";
    const title = s.title || "";
    const time = h.played_at ? new Date(h.played_at * 1000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
    const cover = await fetchCover(artist, title, s.art);
    return `<div class="history-card">
      <img loading="lazy" src="${cover}" alt="${escapeHtml(title)}" onerror="this.src='/live/assets/logo.png'"/>
      <div>
        <div class="hc-title">${escapeHtml(title)}</div>
        <div class="hc-artist">${escapeHtml(artist)}</div>
        <div class="hc-time">🕒 ${time}</div>
      </div>
    </div>`;
  }));
  const html = cards.join("");
  // Só reescreve o DOM quando o histórico realmente mudou. Recriar os cards a
  // cada 10s fazia o scroll anchoring do navegador dar pequenos "pulos".
  if (html === lastHistoryHTML) return;
  lastHistoryHTML = html;
  elHistory.innerHTML = html;
}


function escapeHtml(str = "") {
  return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ============================================================
   LAST.FM (artista) — opcional
   ============================================================ */
async function loadArtistInfo(artist) {
  const section = $("artist-section");
  if (!CFG.LASTFM_API_KEY || !artist) { section.hidden = true; return; }
  try {
    const base = "https://ws.audioscrobbler.com/2.0/";
    const info = await fetch(`${base}?method=artist.getinfo&artist=${encodeURIComponent(artist)}&api_key=${CFG.LASTFM_API_KEY}&format=json`).then((r) => r.json());
    const a = info.artist;
    if (!a) { section.hidden = true; return; }
    section.hidden = false;
    $("artist-name").textContent = a.name;
    $("artist-bio").textContent = (a.bio?.summary || "").replace(/<a .*?<\/a>/g, "").trim() || "Sem biografia disponível.";
    $("artist-tags").textContent = (a.tags?.tag || []).map((t) => `#${t.name}`).join("  ");
    $("artist-similar").textContent = (a.similar?.artist || []).map((s) => s.name).join(", ") || "—";
    const img = (a.image || []).reverse().find((i) => i["#text"]);
    $("artist-photo").src = img ? img["#text"] : discCover.src;
    $("artist-photo").onerror = () => { $("artist-photo").src = "/live/assets/logo.png"; };
  } catch (_) {
    section.hidden = true;
  }
}

/* ============================================================
   PESQUISA (Deezer)
   ============================================================ */
async function doSearch() {
  const q = $("search-input").value.trim();
  const out = $("search-results");
  if (!q) { out.innerHTML = ""; return; }
  out.innerHTML = '<p class="muted">Buscando…</p>';
  try {
    const data = await jsonp(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=8`);
    const rows = (data.data || []).map((t) => `
      <div class="search-item glass">
        <img loading="lazy" src="${t.album?.cover_medium || "/live/assets/logo.png"}" alt=""/>
        <div><div class="hc-title">${escapeHtml(t.title)}</div>
        <div class="hc-artist">${escapeHtml(t.artist?.name || "")}</div></div>
      </div>`);
    out.innerHTML = rows.length ? rows.join("") : '<p class="muted">Nada encontrado.</p>';
  } catch (_) {
    out.innerHTML = '<p class="muted">Busca indisponível no momento.</p>';
  }
}
$("search-btn").addEventListener("click", doSearch);
$("search-input").addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(); });

/* ============================================================
   CLIMA (OpenWeather) — Localização Aproximada do Usuário
   ============================================================ */
async function loadWeather(userCoords = null) {
  const w = $("weather");
  if (!w) return;
  const apiKey = (CFG.OPENWEATHER_API_KEY || "04c885cd2c39edb36321c0b2b4547265").trim();
  if (!apiKey) { w.style.display = "none"; return; }

  try {
    let lat, lon, cityName = "";

    // 1. Prioridade: coordenadas passadas por parâmetro ou salvas pelo mapa
    if (userCoords && typeof userCoords.lat === "number" && typeof userCoords.lng === "number") {
      lat = userCoords.lat;
      lon = userCoords.lng;
      cityName = userCoords.city || "";
    } else if (window.CAVEIRA_USER_LOCATION && typeof window.CAVEIRA_USER_LOCATION.lat === "number") {
      lat = window.CAVEIRA_USER_LOCATION.lat;
      lon = window.CAVEIRA_USER_LOCATION.lng;
      cityName = window.CAVEIRA_USER_LOCATION.city || "";
    } else if (typeof window.fetchCaveiraUserLocation === "function") {
      try {
        const geo = await window.fetchCaveiraUserLocation();
        if (geo && typeof geo.lat === "number") {
          lat = geo.lat;
          lon = geo.lng;
          cityName = geo.city || "";
        }
      } catch (_) {}
    }

    // 2. Fallback de detecção direta por IP caso o mapa ainda não tenha inicializado
    if (lat === undefined || lon === undefined) {
      try {
        const ipRes = await fetch("https://ipapi.co/json/", { cache: "force-cache" });
        if (ipRes.ok) {
          const ipData = await ipRes.json();
          if (ipData.latitude && ipData.longitude) {
            lat = parseFloat(ipData.latitude);
            lon = parseFloat(ipData.longitude);
            cityName = ipData.city || "";
          }
        }
      } catch (_) {}
    }

    // 3. Monta a URL para OpenWeatherMap (com coordenadas aproximadas)
    let url;
    if (lat !== undefined && lon !== undefined) {
      url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&lang=pt_br&appid=${apiKey}`;
    } else {
      const queryCity = CFG.WEATHER_CITY || "Sao Paulo,BR";
      url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(queryCity)}&units=metric&lang=pt_br&appid=${apiKey}`;
    }

    let weatherData = null;

    // Tenta OpenWeatherMap primeiro (com coordenadas ou query)
    try {
      const res = await fetch(url);
      if (res.ok) {
        const d = await res.json();
        if (d.cod && String(d.cod) === "200") {
          const iconCode = d.weather?.[0]?.icon || "";
          const weatherMain = d.weather?.[0]?.main || "";
          const isNight = iconCode.endsWith("n");

          const iconMap = {
            "01d": "☀️", "01n": "🌙",
            "02d": "⛅", "02n": "☁️",
            "03d": "☁️", "03n": "☁️",
            "04d": "☁️", "04n": "☁️",
            "09d": "🌧️", "09n": "🌧️",
            "10d": "🌦️", "10n": "🌧️",
            "11d": "⛈️", "11n": "⛈️",
            "13d": "❄️", "13n": "❄️",
            "50d": "🌫️", "50n": "🌫️",
          };
          const mainFallback = {
            Clear: isNight ? "🌙" : "☀️",
            Clouds: "☁️",
            Rain: "🌧️",
            Drizzle: "🌦️",
            Thunderstorm: "⛈️",
            Snow: "❄️",
            Mist: "🌫️",
            Fog: "🌫️",
            Haze: "🌫️",
          };

          const rawDesc = d.weather?.[0]?.description || "Clima estável";
          weatherData = {
            icon: iconMap[iconCode] || mainFallback[weatherMain] || "🌡️",
            city: d.name || cityName || "Sua Cidade",
            temp: Math.round(d.main?.temp ?? 0),
            feelsLike: Math.round(d.main?.feels_like ?? d.main?.temp ?? 0),
            humidity: d.main?.humidity ?? 0,
            desc: rawDesc.charAt(0).toUpperCase() + rawDesc.slice(1),
          };
        }
      }
    } catch (_) {}

    // Fallback de coordenadas (Open-Meteo) se OpenWeatherMap estiver propagando a chave
    if (!weatherData && lat !== undefined && lon !== undefined) {
      try {
        const omUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,is_day&timezone=auto`;
        const omRes = await fetch(omUrl);
        if (omRes.ok) {
          const omData = await omRes.json();
          const cur = omData.current || {};
          const isDay = cur.is_day === 1;
          const code = cur.weather_code ?? 0;

          // Mapeamento WMO
          let icon = isDay ? "☀️" : "🌙";
          let desc = "Céu limpo";
          if (code === 1 || code === 2) { icon = isDay ? "⛅" : "☁️"; desc = "Parcialmente nublado"; }
          else if (code === 3) { icon = "☁️"; desc = "Encoberto"; }
          else if ([45, 48].includes(code)) { icon = "🌫️"; desc = "Neblina"; }
          else if ([51, 53, 55].includes(code)) { icon = "🌦️"; desc = "Garoa"; }
          else if ([61, 63, 65].includes(code)) { icon = "🌧️"; desc = "Chuva"; }
          else if ([80, 81, 82].includes(code)) { icon = "🌧️"; desc = "Pancadas de chuva"; }
          else if ([95, 96, 99].includes(code)) { icon = "⛈️"; desc = "Tempestade"; }
          else if ([71, 73, 75, 77, 85, 86].includes(code)) { icon = "❄️"; desc = "Neve"; }

          weatherData = {
            icon,
            city: cityName || "Sua Região",
            temp: Math.round(cur.temperature_2m ?? 0),
            feelsLike: Math.round(cur.temperature_2m ?? 0),
            humidity: Math.round(cur.relative_humidity_2m ?? 0),
            desc,
          };
        }
      } catch (_) {}
    }

    if (!weatherData) return;

    const elIcon = $("weather-icon");
    const elTemp = $("weather-temp");
    const elCity = $("weather-city");
    const elCond = $("weather-cond");

    if (elIcon) elIcon.textContent = weatherData.icon;
    if (elTemp) elTemp.textContent = `${weatherData.temp}°C`;
    if (elCity) elCity.textContent = weatherData.city;
    if (elCond) elCond.textContent = `${weatherData.desc} • ${weatherData.humidity}% umid.`;

    w.title = `${weatherData.city}: ${weatherData.desc} (${weatherData.temp}°C, sensação ${weatherData.feelsLike}°C, ${weatherData.humidity}% umidade)`;
    w.style.display = "flex";
  } catch (err) {
    console.warn("Aviso ao carregar clima:", err);
  }
}

// Atualiza o clima instantaneamente assim que a geolocalização do usuário for determinada
window.addEventListener("caveira:location_ready", (e) => {
  if (e.detail) {
    loadWeather(e.detail);
  }
});

/* ============================================================
   NOTÍCIAS — GNews / NewsAPI (opcional)
   ============================================================ */
async function loadNews() {
  const section = $("news-section");
  const list = $("news-list");
  let articles = [];
  try {
    if (CFG.GNEWS_API_KEY) {
      const d = await fetch(`https://gnews.io/api/v4/top-headlines?country=${CFG.NEWS_COUNTRY || "br"}&max=6&token=${CFG.GNEWS_API_KEY}`).then((r) => r.json());
      articles = (d.articles || []).map((a) => ({ title: a.title, url: a.url, image: a.image, source: a.source?.name }));
    } else if (CFG.NEWSAPI_KEY) {
      const d = await fetch(`https://newsapi.org/v2/top-headlines?country=${CFG.NEWS_COUNTRY || "br"}&pageSize=6&apiKey=${CFG.NEWSAPI_KEY}`).then((r) => r.json());
      articles = (d.articles || []).map((a) => ({ title: a.title, url: a.url, image: a.urlToImage, source: a.source?.name }));
    }
  } catch (_) {}
  if (!articles.length) { section.hidden = true; return; }
  section.hidden = false;
  list.innerHTML = articles.map((a) => `
    <a class="news-card" href="${a.url}" target="_blank" rel="noopener">
      <img loading="lazy" src="${a.image || "/live/assets/logo.png"}" alt="" onerror="this.src='/live/assets/logo.png'"/>
      <div>
        <div class="nc-title">${escapeHtml(a.title || "")}</div>
        <div class="nc-source">${escapeHtml(a.source || "")}</div>
      </div>
    </a>`).join("");
}

/* ============================================================
   PEDIDOS DE MÚSICA (AzuraCast)
   ============================================================ */
function azuraBase() {
  const base = (CFG.AZURACAST_BASE_URL || "").replace(/\/+$/, "");
  return `${base}/api/station/${CFG.AZURACAST_STATION_ID || "1"}`;
}
/* --- Acervo completo (autocomplete) --- */
let catalogPromise = null;
function loadCatalog() {
  if (catalogPromise) return catalogPromise;
  catalogPromise = (async () => {
    const rows = [];
    // Percorre todas as páginas da API até carregar o acervo completo.
    // A API limita o per_page — usamos o valor real devolvido e buscamos em paralelo.
    const first = await fetch(`${azuraBase()}/requests?per_page=500&page=1`).then((r) => r.json());
    if (Array.isArray(first)) {
      rows.push(...first);
    } else if (first && Array.isArray(first.rows)) {
      rows.push(...first.rows);
      const perPage = first.per_page || first.rows.length || 25;
      const pages = first.total_pages || Math.ceil((first.total || 0) / perPage) || 1;
      const BATCH = 10;
      for (let page = 2; page <= pages; page += BATCH) {
        const batch = [];
        for (let p = page; p < page + BATCH && p <= pages; p++) {
          batch.push(
            fetch(`${azuraBase()}/requests?per_page=${perPage}&page=${p}`)
              .then((r) => r.json())
              .catch(() => null),
          );
        }
        (await Promise.all(batch)).forEach((d) => {
          if (d) rows.push(...(Array.isArray(d) ? d : d.rows || []));
        });
      }
    }


    return rows.map((it) => {
      const s = it.song || {};
      const yearRaw = s.year || (s.custom_fields && s.custom_fields.year) || "";
      const year = /^\d{4}$/.test(String(yearRaw)) ? String(yearRaw) : "";
      return {
        id: it.request_id || "",
        sid: String(s.id || ""),
        title: s.title || "",
        artist: s.artist || "",
        album: s.album || "",
        text: s.text || "",
        year,
        art: s.art || "",
        hay: `${s.title || ""} ${s.artist || ""} ${s.album || ""}`.toLowerCase(),
      };
    })
      .filter((x) => x.title || x.artist)
      .sort((a, b) => (a.title || "").localeCompare(b.title || "", "pt-BR"));
  })().catch(() => []);
  return catalogPromise;
}

/* --- Bandas geradas a partir do acervo (artista principal normalizado) --- */
function bandKey(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/* Extrai o artista principal, descartando convidados/participações */
function primaryArtist(raw) {
  let s = String(raw || "").trim();
  if (!s) return "";
  // remove trechos entre parênteses/colchetes do tipo (feat. X), [with Y]
  s = s.replace(/[([][^)\]]*\b(feat|ft|featuring|with|part|participa)\b[^)\]]*[)\]]/gi, " ");
  // corta no primeiro separador de convidados (vírgula, ponto e vírgula, feat., &, x, vs)
  const cut = s.split(
    /\s*(?:,|;|\||\/{2,}|\bfeat\.?\b|\bft\.?\b|\bfeaturing\b|\bwith\b|\bcom\b|\bvs\.?\b|\bversus\b|\bpart\.?\b|&)\s*/i,
  )[0];
  return (cut || s).replace(/\s{2,}/g, " ").trim();
}

let foldersPromise = null;
function loadFolders() {
  if (foldersPromise) return foldersPromise;
  foldersPromise = (async () => {
    const catalog = await loadCatalog();
    const bySong = new Map();
    const groups = new Map(); // key -> { names: Map<name, count>, count }

    catalog.forEach((it) => {
      let name = primaryArtist(it.artist);
      if (!name && it.text) name = primaryArtist(String(it.text).split(" - ")[0]);
      const key = bandKey(name);
      if (!key) return;
      if (it.sid) bySong.set(it.sid, key);
      const g = groups.get(key) || { names: new Map(), count: 0 };
      g.names.set(name, (g.names.get(name) || 0) + 1);
      g.count += 1;
      groups.set(key, g);
    });

    const bands = [...groups.entries()]
      .map(([key, g]) => {
        // nome de exibição: o mais frequente; em empate, o mais curto
        const best = [...g.names.entries()].sort(
          (a, b) => b[1] - a[1] || a[0].length - b[0].length || a[0].localeCompare(b[0], "pt-BR"),
        )[0][0];
        return { key, name: best };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

    return { bands: bands.map((b) => b.name), bySong };
  })().catch(() => ({ bands: [], bySong: new Map() }));
  return foldersPromise;
}




const acBox = $("request-ac");
const acInput = $("request-search");
const acOut = $("request-results");
const submitBtn = $("request-submit");

/* Música selecionada pelo usuário — pedidos SÓ acontecem com seleção explícita */
let selectedTrack = null;

function setSelected(track) {
  selectedTrack = track;
  acInput.dataset.requestId = track ? track.id : "";
  if (submitBtn) {
    submitBtn.disabled = !track;
    submitBtn.classList.toggle("is-disabled", !track);
  }
}

const acSection = document.getElementById("pedidos");
function openAC() {
  acOut.classList.add("open");
  if (acSection) acSection.classList.add("ac-open");
  acInput.setAttribute("aria-expanded", "true");
}
function closeAC() {
  acOut.classList.remove("open");
  if (acSection) acSection.classList.remove("ac-open");
  acInput.setAttribute("aria-expanded", "false");
}

const AC_CHUNK = 40;
let acItems = [];
let acShown = 0;

function acItemHtml(it, i) {
  return `
    <div class="rr-item" role="option" data-i="${i}">
      ${it.art
        ? `<img class="rr-art" src="${escapeHtml(it.art)}" alt="" loading="lazy" />`
        : '<span class="rr-art rr-art-fallback">🎵</span>'}
      <span class="rr-txt">
        <span class="rr-title">${escapeHtml(it.title)}</span>
        <span class="rr-sub">${escapeHtml(it.artist)}${it.album ? " • " + escapeHtml(it.album) : ""}${it.year ? ` (${it.year})` : ""}</span>
      </span>
      <span class="rr-pick">▶</span>
    </div>`;
}

function acAppendChunk() {
  const list = acOut.querySelector(".rr-list");
  if (!list || acShown >= acItems.length) return;
  const next = acItems.slice(acShown, acShown + AC_CHUNK);
  list.insertAdjacentHTML("beforeend", next.map((it, k) => acItemHtml(it, acShown + k)).join(""));
  acShown += next.length;
}

function renderAC(items, headerLabel) {
  acItems = items;
  acShown = 0;
  if (!items.length) {
    acOut.innerHTML = '<p class="rr-empty">Nenhuma música encontrada no acervo.</p>';
    openAC();
    return;
  }
  const count = `${items.length} música${items.length === 1 ? "" : "s"} encontrada${items.length === 1 ? "" : "s"}`;
  acOut.innerHTML = `
    <div class="rr-head">
      <span class="rr-head-title">🎵 ${escapeHtml(headerLabel || "Músicas disponíveis no acervo")}</span>
      <span class="rr-head-count">${count}</span>
    </div>
    <div class="rr-list"></div>`;
  acAppendChunk();
  openAC();
}

acOut.addEventListener("mousedown", (e) => {
  if (e.target.closest(".rr-item")) e.preventDefault();
});
acOut.addEventListener("click", (e) => {
  const el = e.target.closest(".rr-item");
  if (!el) return;
  const it = acItems[Number(el.dataset.i)];
  if (!it) return;
  acInput.value = `${it.title} — ${it.artist}`.trim();
  setSelected(it);
  const st = $("request-status");
  if (st) st.textContent = "";
  closeAC();
  acInput.focus();
  const end = acInput.value.length;
  acInput.setSelectionRange(end, end);
});
acOut.addEventListener("scroll", () => {
  if (acOut.scrollTop + acOut.clientHeight >= acOut.scrollHeight - 120) acAppendChunk();
});

async function updateAC(query, headerLabel) {
  const catalog = await loadCatalog();
  const q = (query || "").trim().toLowerCase();
  const terms = q.split(/\s+/).filter(Boolean);
  const items = terms.length
    ? catalog.filter((it) => terms.every((t) => it.hay.includes(t)))
    : catalog;
  renderAC(items, headerLabel || (q ? `Resultados para "${query.trim()}"` : "Músicas disponíveis no acervo"));
}

/* Filtra TODAS as músicas de uma PASTA/banda (sem limite de resultados) */
async function updateACByBand(band) {
  const [catalog, folders] = await Promise.all([loadCatalog(), loadFolders()]);
  const key = bandKey(band);
  let items = catalog.filter((it) => {
    const mapped = it.sid ? folders.bySong.get(it.sid) : null;
    return (mapped || bandKey(primaryArtist(it.artist))) === key;
  });
  if (!items.length) items = catalog.filter((it) => bandKey(`${it.artist} ${it.text}`).includes(key));
  renderAC(items, band);
}




let acTimer;
acInput.addEventListener("input", () => {
  setSelected(null);
  clearTimeout(acTimer);
  acTimer = setTimeout(() => updateAC(acInput.value), 140);
});
acInput.addEventListener("focus", () => updateAC(acInput.value));
acInput.addEventListener("click", () => updateAC(acInput.value));
document.addEventListener("click", (e) => {
  if (acBox.contains(e.target) || e.target.closest(".bands-accordion")) return;
  closeAC();
});
acInput.addEventListener("keydown", (e) => { if (e.key === "Escape") closeAC(); });

async function submitRequestById(id) {
  const status = $("request-status");
  status.textContent = "Enviando pedido…";
  try {
    const r = await fetch(`${azuraBase()}/request/${id}`, { method: "POST" });
    if (!r.ok) throw new Error("falhou");
    status.textContent = "✅ Pedido enviado! Aguarde entrar na fila.";
  } catch (_) {
    status.textContent = "⚠️ Não foi possível enviar o pedido agora.";
  }
}

setSelected(null);
/* Pré-carrega o acervo para o dropdown abrir instantaneamente */
loadCatalog();

submitBtn.addEventListener("click", async () => {
  const status = $("request-status");
  if (!selectedTrack || !selectedTrack.id) {
    status.textContent = "Selecione uma música da lista.";
    updateAC(acInput.value);
    return;
  }
  closeAC();
  await submitRequestById(selectedTrack.id);
});

/* Accordion de bandas disponíveis (dinâmico) */
(function setupBands() {
  const toggle = $("bands-toggle");
  const panel = $("bands-panel");
  const list = $("bands-list");
  const label = $("bands-label");
  if (!toggle || !panel || !list) return;
  toggle.addEventListener("click", () => {
    const open = panel.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  const render = (bands) => {
    if (label) label.textContent = `🎸 Bandas disponíveis no acervo (${bands.length})`;
    list.innerHTML = bands.map((b) => `<li>${escapeHtml(b)}</li>`).join("");
    list.querySelectorAll("li").forEach((li) => {
      li.addEventListener("click", () => {
        panel.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
        acInput.value = li.textContent.trim();
        setSelected(null);
        const st = $("request-status");
        if (st) st.textContent = "";
        acInput.focus();
        const end = acInput.value.length;
        acInput.setSelectionRange(end, end);
        updateACByBand(li.textContent.trim());
      });
    });
  };
  window.__cvmBandsRefresh = render;
  loadFolders().then(({ bands }) => render(bands));

})();



/* ============================================================
   RELÓGIO + SAUDAÇÃO
   ============================================================ */
function tickClock() {
  const now = new Date();
  $("clock").textContent = now.toLocaleTimeString("pt-BR");
  $("date").textContent = now.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
  const h = now.getHours();
  $("greeting").textContent = h < 6 ? "Boa madrugada 🌙" : h < 12 ? "Bom dia ☀️" : h < 18 ? "Boa tarde 🎸" : "Boa noite 🤘";
}

/* ============================================================
   COMPARTILHAMENTO + QR CODE + Playlist finder
   ============================================================ */
function setupShare() {
  const url = encodeURIComponent(CFG.SHARE_URL);
  const text = encodeURIComponent(CFG.SHARE_TEXT);
  const map = {
    whatsapp: `https://wa.me/?text=${text}%20${url}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
    telegram: `https://t.me/share/url?url=${url}&text=${text}`,
    x: `https://twitter.com/intent/tweet?text=${text}&url=${url}`,
  };
  document.querySelectorAll("[data-net]").forEach((el) => {
    const net = el.dataset.net;
    if (map[net]) el.href = map[net];
  });
  $("qrcode").src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&bgcolor=ffffff&color=000000&data=${encodeURIComponent(CFG.QR_TARGET)}`;
  const pf = $("playlist-finder-link");
  if (pf) pf.href = CFG.PLAYLIST_FINDER_URL || "https://discography-finder.ai.studio/";

  // Botões de cópia direta (VLC, Winamp Classic, etc.)
  document.querySelectorAll("[data-copy-url]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      const urlToCopy = btn.getAttribute("data-copy-url");
      const label = btn.getAttribute("data-copy-label") || "Link";

      let copiedSuccessfully = false;
      if (navigator.clipboard && window.isSecureContext) {
        try {
          await navigator.clipboard.writeText(urlToCopy);
          copiedSuccessfully = true;
        } catch (err) {
          copiedSuccessfully = false;
        }
      }

      if (!copiedSuccessfully) {
        try {
          const ta = document.createElement("textarea");
          ta.value = urlToCopy;
          ta.style.position = "fixed";
          ta.style.top = "-9999px";
          ta.style.left = "-9999px";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          copiedSuccessfully = document.execCommand("copy");
          ta.remove();
        } catch (err) {
          copiedSuccessfully = false;
        }
      }

      if (copiedSuccessfully) {
        const originalHtml = btn.innerHTML;
        btn.classList.add("copied");
        btn.innerHTML = `<span class="share-ico">✅</span><span class="share-name">Copiado!</span>`;
        if (typeof window.showToast === "function") {
          window.showToast(`Link do ${label} copiado: ${urlToCopy} 🤘`, "success");
        }
        setTimeout(() => {
          btn.classList.remove("copied");
          btn.innerHTML = originalHtml;
        }, 2200);
      } else {
        if (typeof window.showToast === "function") {
          window.showToast(`Não foi possível copiar automaticamente. URL: ${urlToCopy}`, "error");
        } else {
          prompt("Copie o link abaixo:", urlToCopy);
        }
      }
    });
  });
}

/* ============================================================
   PARTÍCULAS (canvas)
   ============================================================ */
function initParticles() {
  const canvas = $("particles");
  const ctx = canvas.getContext("2d");
  let W, H, particles;
  function resize() {
    // clientWidth/clientHeight excluem a barra de rolagem (innerWidth a inclui
    // e provocava overflow horizontal intermitente)
    W = canvas.width = document.documentElement.clientWidth;
    H = canvas.height = document.documentElement.clientHeight;
  }
  function make() {
    particles = Array.from({ length: Math.min(70, Math.floor(W / 22)) }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      r: Math.random() * 2 + 0.5, vy: Math.random() * 0.5 + 0.15,
      vx: (Math.random() - 0.5) * 0.3, a: Math.random() * 0.5 + 0.2,
    }));
  }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    particles.forEach((p) => {
      p.y -= p.vy; p.x += p.vx;
      if (p.y < -5) { p.y = H + 5; p.x = Math.random() * W; }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(229, 9, 20, ${p.a})`;
      ctx.shadowColor = "#ff2d3f"; ctx.shadowBlur = 8;
      ctx.fill();
    });
    requestAnimationFrame(draw);
  }
  resize(); make(); draw();
  addEventListener("resize", () => { resize(); make(); });
}

function initStickyObserver() {
  const sticky = $("sticky-player");
  const hero = $("hero");
  if (!sticky || !hero) return;
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) {
          sticky.classList.add("visible");
        } else {
          sticky.classList.remove("visible");
        }
      });
    }, { threshold: 0.15 });
    io.observe(hero);
  } else {
    window.addEventListener("scroll", () => {
      if (window.scrollY > 350) sticky.classList.add("visible");
      else sticky.classList.remove("visible");
    });
  }
}

/* ============================================================
   INIT
   ============================================================ */
$("year").textContent = new Date().getFullYear();
setupShare();
initParticles();
initStickyObserver();
tickClock(); setInterval(tickClock, 1000);
loadWeather(); setInterval(loadWeather, 10 * 60 * 1000);
loadNews(); setInterval(loadNews, 15 * 60 * 1000);
updateNowPlaying(); setInterval(updateNowPlaying, CFG.REFRESH_MS);
