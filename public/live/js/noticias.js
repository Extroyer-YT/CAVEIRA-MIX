/* ============================================================
   Caveira Mix — Portal Mundo do Rock (JavaScript)
   ============================================================ */

const CFG = window.CAVEIRA_CONFIG || {
  STREAM_URL: "https://caveira-mix.uk/listen/caveira_mix/radio.mp3",
  NOWPLAYING_URL: "https://caveira-mix.uk/api/nowplaying/1",
  REFRESH_MS: 10000,
};

const $ = (id) => document.getElementById(id);

/* ---------- Header Audio Streamer ---------- */
const headerAudio = $("header-audio");
const btnHeaderPlay = $("btn-header-play");
let isAudioPlaying = false;

function toggleHeaderAudio() {
  if (!headerAudio) return;
  if (isAudioPlaying) {
    headerAudio.pause();
    isAudioPlaying = false;
    if (btnHeaderPlay) btnHeaderPlay.textContent = "▶";
  } else {
    if (!headerAudio.src) headerAudio.src = CFG.STREAM_URL;
    headerAudio.play().then(() => {
      isAudioPlaying = true;
      if (btnHeaderPlay) btnHeaderPlay.textContent = "⏸";
    }).catch(() => {});
  }
}
if (btnHeaderPlay) btnHeaderPlay.addEventListener("click", toggleHeaderAudio);

async function updateHeaderNowPlaying() {
  try {
    const res = await fetch(CFG.NOWPLAYING_URL, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    const np = data.now_playing?.song || {};
    const title = np.title || "Ao Vivo";
    const artist = np.artist || "Caveira Mix";
    const elTitle = $("header-stream-title");
    const elArtist = $("header-stream-artist");
    if (elTitle) elTitle.textContent = title;
    if (elArtist) elArtist.textContent = artist;
  } catch (_) {}
}
updateHeaderNowPlaying();
setInterval(updateHeaderNowPlaying, CFG.REFRESH_MS || 10000);

/* ============================================================
   MUSICBRAINZ + COVER ART ARCHIVE (CAA) FETCHER
   ============================================================ */
const MB_CACHE_KEY = "cav_mb_album_covers_v2";
function loadMBCache() {
  try { return JSON.parse(localStorage.getItem(MB_CACHE_KEY) || "{}"); } catch { return {}; }
}
function saveMBCache(cache) {
  try { localStorage.setItem(MB_CACHE_KEY, JSON.stringify(cache)); } catch {}
}
const mbCache = loadMBCache();

async function fetchAlbumCoverMB(album) {
  const key = `${album.band.toLowerCase()}|${album.title.toLowerCase()}`;
  if (mbCache[key]) return mbCache[key];

  // 1. Direct Cover Art Archive by MBID (Release Group / Front)
  if (album.mbid) {
    const caaFront = `https://coverartarchive.org/release-group/${album.mbid}/front-500`;
    try {
      const ok = await fetch(caaFront, { method: "HEAD" }).then((r) => r.ok).catch(() => false);
      if (ok) {
        mbCache[key] = caaFront;
        saveMBCache(mbCache);
        return caaFront;
      }
    } catch (_) {}
  }

  // 2. Consulta à API do MusicBrainz por Release Group
  try {
    const q = `artist:"${album.band}" AND releasegroup:"${album.title}"`;
    const mbData = await fetch(
      `https://musicbrainz.org/ws/2/release-group/?query=${encodeURIComponent(q)}&fmt=json&limit=1`,
      { headers: { "User-Agent": "CaveiraMixRadio/2.0 ( https://caveira-mix.uk )" } },
    ).then((r) => r.json());

    const foundId = mbData?.["release-groups"]?.[0]?.id;
    if (foundId) {
      const caaUrl = `https://coverartarchive.org/release-group/${foundId}/front-500`;
      const ok = await fetch(caaUrl, { method: "HEAD" }).then((r) => r.ok).catch(() => false);
      if (ok) {
        mbCache[key] = caaUrl;
        saveMBCache(mbCache);
        return caaUrl;
      }
    }
  } catch (_) {}

  // 3. Fallback em alta resolução via iTunes Store (1000px)
  try {
    const itunes = await fetch(
      `https://itunes.apple.com/search?media=music&entity=album&limit=1&term=${encodeURIComponent(album.band + " " + album.title)}`,
    ).then((r) => r.json());
    const art = itunes?.results?.[0]?.artworkUrl100;
    if (art) {
      const hq = art.replace(/100x100bb/, "1000x1000bb");
      mbCache[key] = hq;
      saveMBCache(mbCache);
      return hq;
    }
  } catch (_) {}

  // 4. Fallback padrão seguro
  const fallback = album.cover || "/live/assets/logo.png";
  mbCache[key] = fallback;
  saveMBCache(mbCache);
  return fallback;
}

/* ============================================================
   BANCO DE DADOS: MELHORES ÁLBUNS DO ROCK & METAL
   ============================================================ */
const ALBUMS_DATA = [
  {
    rank: 1,
    band: "Metallica",
    title: "Master of Puppets",
    year: 1986,
    genre: "thrash",
    genreLabel: "Thrash Metal",
    mbid: "a4c51478-f9b8-3e4b-9721-a131a48c6680",
    cover: "https://coverartarchive.org/release-group/a4c51478-f9b8-3e4b-9721-a131a48c6680/front-500",
    hymns: ["Master of Puppets", "Battery", "Welcome Home (Sanitarium)", "Orion"],
    why: "Considerado pela crítica mundial a maior obra-prima do Thrash Metal, unindo peso brutal, velocidade e arranjos clássicos perfeitos.",
    spotifyQuery: "Metallica Master of Puppets album"
  },
  {
    rank: 2,
    band: "Black Sabbath",
    title: "Paranoid",
    year: 1970,
    genre: "heavy",
    genreLabel: "Heavy Metal Clássico",
    mbid: "5e24b7a1-1250-3ce4-b778-43d922f30691",
    cover: "https://coverartarchive.org/release-group/5e24b7a1-1250-3ce4-b778-43d922f30691/front-500",
    hymns: ["War Pigs", "Paranoid", "Iron Man", "Electric Funeral"],
    why: "O álbum que definiu o som, a estética e o peso do Heavy Metal para sempre. Riffs lendários de Tony Iommi e a voz icônica de Ozzy.",
    spotifyQuery: "Black Sabbath Paranoid album"
  },
  {
    rank: 3,
    band: "Iron Maiden",
    title: "The Number of the Beast",
    year: 1982,
    genre: "heavy",
    genreLabel: "Heavy Metal",
    mbid: "6c22cb9b-5fe9-3bf6-829d-439589d970a2",
    cover: "https://coverartarchive.org/release-group/6c22cb9b-5fe9-3bf6-829d-439589d970a2/front-500",
    hymns: ["The Number of the Beast", "Run to the Hills", "Hallowed Be Thy Name"],
    why: "A estreia triunfal de Bruce Dickinson na Donzela de Ferro. Um marco absoluto que consolidou a NWOBHM no topo das paradas globais.",
    spotifyQuery: "Iron Maiden The Number of the Beast album"
  },
  {
    rank: 4,
    band: "AC/DC",
    title: "Back in Black",
    year: 1980,
    genre: "hard",
    genreLabel: "Hard Rock",
    mbid: "6049a463-5ff6-3ba4-972e-065d64821a71",
    cover: "https://coverartarchive.org/release-group/6049a463-5ff6-3ba4-972e-065d64821a71/front-500",
    hymns: ["Back in Black", "Hells Bells", "Shoot to Thrill", "You Shook Me All Night Long"],
    why: "O segundo álbum mais vendido de toda a história da música. Uma homenagem inesquecível a Bon Scott e hinos de guitarra imortais.",
    spotifyQuery: "AC DC Back in Black album"
  },
  {
    rank: 5,
    band: "Sepultura",
    title: "Roots",
    year: 1996,
    genre: "nacional",
    genreLabel: "Groove / Metal Nacional",
    mbid: "d9a71be7-578d-327c-9b16-64fe461c28c8",
    cover: "https://coverartarchive.org/release-group/d9a71be7-578d-327c-9b16-64fe461c28c8/front-500",
    hymns: ["Roots Bloody Roots", "Attitude", "Ratamahatta", "Spit"],
    why: "A obra revolucionária brasileira que misturou a percussão indígena e afro-brasileira com o peso avassalador do metal moderno.",
    spotifyQuery: "Sepultura Roots album"
  },
  {
    rank: 6,
    band: "System of a Down",
    title: "Toxicity",
    year: 2001,
    genre: "heavy",
    genreLabel: "Alternative Metal",
    mbid: "ca6fa145-a7b2-3868-b7ee-0a259253457a",
    cover: "https://coverartarchive.org/release-group/ca6fa145-a7b2-3868-b7ee-0a259253457a/front-500",
    hymns: ["Chop Suey!", "Toxicity", "Aerials", "Forest"],
    why: "Álbum explosivo que alcançou o #1 nos EUA na semana do 11 de setembro, transformando o SOAD em gigantes da música pesada moderna.",
    spotifyQuery: "System of a Down Toxicity album"
  },
  {
    rank: 7,
    band: "Nirvana",
    title: "Nevermind",
    year: 1991,
    genre: "grunge",
    genreLabel: "Grunge / Rock 90s",
    mbid: "1b022b01-9076-37ac-857f-9477e77a11d4",
    cover: "https://coverartarchive.org/release-group/1b022b01-9076-37ac-857f-9477e77a11d4/front-500",
    hymns: ["Smells Like Teen Spirit", "Come as You Are", "Lithium", "In Bloom"],
    why: "O álbum que desbancou Michael Jackson das paradas e fez do movimento Grunge de Seattle a força cultural dominante dos anos 90.",
    spotifyQuery: "Nirvana Nevermind album"
  },
  {
    rank: 8,
    band: "Dio",
    title: "Holy Diver",
    year: 1983,
    genre: "heavy",
    genreLabel: "Heavy Metal",
    mbid: "d2e74c83-05c0-3ec6-b333-68d71da50937",
    cover: "https://coverartarchive.org/release-group/d2e74c83-05c0-3ec6-b333-68d71da50937/front-500",
    hymns: ["Holy Diver", "Rainbow in the Dark", "Stand Up and Shout", "Don't Talk to Strangers"],
    why: "Ronnie James Dio na sua forma mais brilhante. Guitarras afiadas de Vivian Campbell e a voz mais poderosa do Metal.",
    spotifyQuery: "Dio Holy Diver album"
  },
  {
    rank: 9,
    band: "Megadeth",
    title: "Rust in Peace",
    year: 1990,
    genre: "thrash",
    genreLabel: "Technical Thrash Metal",
    mbid: "5476a6cf-3543-39d7-84bc-23baaa7662c1",
    cover: "https://coverartarchive.org/release-group/5476a6cf-3543-39d7-84bc-23baaa7662c1/front-500",
    hymns: ["Holy Wars... The Punishment Due", "Hangar 18", "Tornado of Souls"],
    why: "O ápice técnico do Thrash Metal com o duelo monumental de guitarras entre Dave Mustaine e Marty Friedman.",
    spotifyQuery: "Megadeth Rust in Peace album"
  },
  {
    rank: 10,
    band: "Guns N' Roses",
    title: "Appetite for Destruction",
    year: 1987,
    genre: "hard",
    genreLabel: "Hard Rock / Sleaze",
    mbid: "e5e49226-9d32-3580-b74a-251c6c06b251",
    cover: "https://coverartarchive.org/release-group/e5e49226-9d32-3580-b74a-251c6c06b251/front-500",
    hymns: ["Welcome to the Jungle", "Sweet Child O' Mine", "Paradise City"],
    why: "O álbum de estreia mais vendido dos EUA, trazendo a energia crua e perigosa das ruas de Los Angeles de volta ao rock.",
    spotifyQuery: "Guns N Roses Appetite for Destruction album"
  },
  {
    rank: 11,
    band: "Alice In Chains",
    title: "Dirt",
    year: 1992,
    genre: "grunge",
    genreLabel: "Grunge / Sludge Metal",
    mbid: "fbc6b757-7fe4-3112-9c4c-3c3e29f37fe3",
    cover: "https://coverartarchive.org/release-group/fbc6b757-7fe4-3112-9c4c-3c3e29f37fe3/front-500",
    hymns: ["Would?", "Rooster", "Down in a Hole", "Them Bones"],
    why: "Uma das obras mais sombrias, sinceras e influentes dos anos 90, com as harmonias vocais inigualáveis de Layne Staley e Jerry Cantrell.",
    spotifyQuery: "Alice in Chains Dirt album"
  },
  {
    rank: 12,
    band: "Angra",
    title: "Angels Cry",
    year: 1993,
    genre: "nacional",
    genreLabel: "Power / Metal Melódico",
    mbid: "77ea63f8-8bb3-3990-a7d5-e366f3e5caad",
    cover: "https://coverartarchive.org/release-group/77ea63f8-8bb3-3990-a7d5-e366f3e5caad/front-500",
    hymns: ["Carry On", "Angels Cry", "Time", "Never Understand"],
    why: "A obra-prima do metal nacional que conquistou o Japão e a Europa, unindo música clássica, metal melódico e ritmos brasileiros com Andre Matos.",
    spotifyQuery: "Angra Angels Cry album"
  },
  {
    rank: 13,
    band: "Slayer",
    title: "Reign in Blood",
    year: 1986,
    genre: "thrash",
    genreLabel: "Thrash Metal",
    mbid: "652c6f14-9777-3e1b-b461-9c60e34c56e0",
    cover: "https://coverartarchive.org/release-group/652c6f14-9777-3e1b-b461-9c60e34c56e0/front-500",
    hymns: ["Raining Blood", "Angel of Death", "Postmortem"],
    why: "28 minutos de pura velocidade e fúria que redefiniram o Thrash e o Death Metal mundial.",
    spotifyQuery: "Slayer Reign in Blood album"
  },
  {
    rank: 14,
    band: "Judas Priest",
    title: "Painkiller",
    year: 1990,
    genre: "heavy",
    genreLabel: "Speed / Heavy Metal",
    mbid: "70e6c646-fdf6-3023-9584-3b2d7cb6a6bf",
    cover: "https://coverartarchive.org/release-group/70e6c646-fdf6-3023-9584-3b2d7cb6a6bf/front-500",
    hymns: ["Painkiller", "Hell Patrol", "A Touch of Evil", "Night Crawler"],
    why: "Rob Halford nos agudos mais impressionantes da história e a bateria avassaladora de Scott Travis.",
    spotifyQuery: "Judas Priest Painkiller album"
  }
];

function renderAlbums(filter = "todos") {
  const container = $("albums-grid");
  if (!container) return;
  const filtered = filter === "todos"
    ? ALBUMS_DATA
    : ALBUMS_DATA.filter((a) => a.genre === filter);

  container.innerHTML = filtered.map((a) => `
    <div class="album-card">
      <div class="album-rank-tag ${a.rank === 1 ? "album-rank-1" : a.rank === 2 ? "album-rank-2" : a.rank === 3 ? "album-rank-3" : ""}">
        #${a.rank}
      </div>
      <div class="album-visual-wrap">
        <img class="album-cover-img" id="album-cover-${a.rank}" src="${a.cover}" alt="${a.title} - ${a.band}" loading="lazy" onerror="this.src='/live/assets/logo.png'" />
        <span class="album-year-badge">${a.year}</span>
        <span class="album-caa-badge" title="Capa oficial via MusicBrainz / Cover Art Archive">🏛️ Cover Art Archive</span>
      </div>
      <div class="album-info-main">
        <span class="album-band">${a.band}</span>
        <h3 class="album-name">${a.title}</h3>
        <span class="album-genre-pill">${a.genreLabel}</span>
      </div>
      <div class="album-hymns-box">
        <p class="album-hymns-title">🔥 Hinos do Álbum:</p>
        <p class="album-hymns-list">${a.hymns.join(" • ")}</p>
      </div>
      <p class="album-why">"${a.why}"</p>
      <a class="album-action-btn" href="https://www.youtube.com/results?search_query=${encodeURIComponent(a.spotifyQuery)}" target="_blank" rel="noopener">
        <span>▶</span> Ouvir Álbum Completo
      </a>
    </div>
  `).join("");

  // Carregamento dinâmico assíncrono via MusicBrainz / Cover Art Archive
  filtered.forEach(async (album) => {
    const coverUrl = await fetchAlbumCoverMB(album);
    const imgEl = $(`album-cover-${album.rank}`);
    if (imgEl && coverUrl && imgEl.src !== coverUrl) {
      imgEl.src = coverUrl;
    }
  });
}

/* ============================================================
   WORLD NEWS API & FILTRAGEM EXCLUSIVA DE ROCK & METAL
   ============================================================ */
const NEWS_CACHE_KEY = "cav_world_news_rock_v3";
const NEWS_CACHE_TIME_KEY = "cav_world_news_rock_time_v3";

const ROCK_THUMBS_LIBRARY = {
  metallica: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&q=80",
  maiden: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&q=80",
  sepultura: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800&q=80",
  festivais: "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=800&q=80",
  ghost: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800&q=80",
  acdc: "https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=800&q=80",
  metal: "https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=800&q=80",
  guitar: "https://images.unsplash.com/photo-1511735111819-9a3f7709049c?w=800&q=80",
  show: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=800&q=80",
  studio: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=800&q=80",
};

// Termos estritos para garantir 100% conteúdo de Rock & Derivados
const ROCK_STRICT_REGEX = /\b(rock|metal|heavy metal|hard rock|thrash|death metal|black metal|power metal|groove metal|doom metal|metalcore|nu metal|punk rock|hardcore|grunge|stoner rock|rock progressivo|classic rock|rock nacional|guitarra|guitarrista|riff|headbanger|mosh|metallica|iron maiden|black sabbath|sepultura|slipknot|angra|megadeth|slayer|judas priest|ac\/dc|guns n' roses|led zeppelin|pink floyd|nirvana|queen|ghost|system of a down|alice in chains|dio|motörhead|avenged sevenfold|crypta|linkin park|deftones|korn|rammstein|green day|foo fighters|pearl jam|soundgarden|deep purple|kiss|scorpions|pantera|whiplash|bangers open air|knotfest|monsters of rock|rock in rio|summer breeze)\b/i;

function isStrictlyRock(title = "", desc = "") {
  const text = `${title} ${desc}`;
  return ROCK_STRICT_REGEX.test(text);
}

function categorizeNews(title = "", desc = "") {
  const t = `${title} ${desc}`.toLowerCase();
  if (/\b(sepultura|angra|crypta|ratos de porão|titãs|cpm 22|capital inicial|legião|raul seixas|raimundos|matanza|nacional|brasil|brasileir)\b/i.test(t)) {
    return { category: "nacional", catLabel: "Rock Nacional" };
  }
  if (/\b(rock in rio|knotfest|bangers|monsters of rock|summer breeze|lollapalooza|festival|festivais|turnê|turne|shows|show|estádio|ingressos)\b/i.test(t)) {
    return { category: "festivais", catLabel: "Festivais & Shows" };
  }
  if (/\b(novo single|novo álbum|novo album|lança|lançamento|estreia|inédit|videoclipe|clipe|faixa)\b/i.test(t)) {
    return { category: "lancamentos", catLabel: "Lançamentos" };
  }
  if (/\b(ac\/dc|led zeppelin|pink floyd|queen|deep purple|kiss|guns n' roses|scorpions|rolling stones|beatles|aerosmith|rush|black sabbath|ozzy|dio)\b/i.test(t)) {
    return { category: "classico", catLabel: "Rock Clássico" };
  }
  return { category: "metal", catLabel: "Heavy Metal" };
}

function getRockThumb(title = "", desc = "", fallbackUrl = "") {
  if (fallbackUrl && !fallbackUrl.includes("favicon") && fallbackUrl.startsWith("http")) {
    return fallbackUrl;
  }
  const t = `${title} ${desc}`.toLowerCase();
  if (t.includes("metallica")) return ROCK_THUMBS_LIBRARY.metallica;
  if (t.includes("maiden") || t.includes("dickinson")) return ROCK_THUMBS_LIBRARY.maiden;
  if (t.includes("sepultura") || t.includes("cavalera")) return ROCK_THUMBS_LIBRARY.sepultura;
  if (t.includes("ghost") || t.includes("forge")) return ROCK_THUMBS_LIBRARY.ghost;
  if (t.includes("ac/dc") || t.includes("angus")) return ROCK_THUMBS_LIBRARY.acdc;
  if (t.includes("festival") || t.includes("knotfest") || t.includes("bangers") || t.includes("rock in rio")) return ROCK_THUMBS_LIBRARY.festivais;
  if (t.includes("álbum") || t.includes("grav") || t.includes("estúdio")) return ROCK_THUMBS_LIBRARY.studio;
  if (t.includes("guitar") || t.includes("solo") || t.includes("riff")) return ROCK_THUMBS_LIBRARY.guitar;
  if (t.includes("show") || t.includes("turnê") || t.includes("palco")) return ROCK_THUMBS_LIBRARY.show;
  return ROCK_THUMBS_LIBRARY.metal;
}

let currentNewsFilter = "todas";
let liveRockNewsList = [];

// Base de contingência com notícias curadas caso a rede falhe
const FALLBACK_ROCK_NEWS = [
  {
    id: "news-1",
    category: "metal",
    catLabel: "Heavy Metal",
    title: "Metallica confirma novas datas para a turnê 'M72 World Tour' em estádios",
    desc: "A banda continua quebrando recordes com o palco 360 graus e dois setlists completamente diferentes a cada fim de semana.",
    thumb: ROCK_THUMBS_LIBRARY.metallica,
    date: "Hoje às 18:30",
    source: "Caveira Mix News",
    link: "https://www.google.com/search?q=Metallica+turne+shows"
  },
  {
    id: "news-2",
    category: "metal",
    catLabel: "Heavy Metal",
    title: "Iron Maiden celebra 50 anos de história com a colossal turnê 'Run For Your Lives'",
    desc: "Bruce Dickinson e Steve Harris prometem uma produção visual inédita com músicas dos 9 primeiros álbuns de estúdio.",
    thumb: ROCK_THUMBS_LIBRARY.maiden,
    date: "Hoje às 15:40",
    source: "Metal Hammer / Caveira Mix",
    link: "https://www.google.com/search?q=Iron+Maiden+Run+For+Your+Lives"
  },
  {
    id: "news-3",
    category: "nacional",
    catLabel: "Rock Nacional",
    title: "Sepultura emociona multidões na turnê global de despedida 'Celebrating Life Through Death'",
    desc: "Com o virtuoso Greyson Nekrutman na bateria, os gigantes brasileiros entregam apresentações viscerais por todo o planeta.",
    thumb: ROCK_THUMBS_LIBRARY.sepultura,
    date: "Ontem às 21:10",
    source: "Whiplash / Caveira Mix",
    link: "https://www.google.com/search?q=Sepultura+Celebrating+Life+Through+Death"
  },
  {
    id: "news-4",
    category: "festivais",
    catLabel: "Festivais & Shows",
    title: "Bangers Open Air e Monsters of Rock confirmam line-ups pesadíssimos no Brasil",
    desc: "Os maiores festivais de metal da América Latina preparam palcos monumentais com lendas internacionais do Power, Thrash e Heavy Metal.",
    thumb: ROCK_THUMBS_LIBRARY.festivais,
    date: "Ontem às 17:00",
    source: "RockBizz / Festivais",
    link: "https://www.google.com/search?q=Bangers+Open+Air+Monsters+of+Rock+Brasil"
  },
  {
    id: "news-5",
    category: "lancamentos",
    catLabel: "Lançamentos",
    title: "Ghost lança novo single bombástico e prepara próximo capítulo teatral",
    desc: "Tobias Forge apresenta nova era visual e sonora misteriosa com guitarras pesadas e refrões grandiosos de arena rock.",
    thumb: ROCK_THUMBS_LIBRARY.ghost,
    date: "Há 2 dias",
    source: "Blabbermouth / Caveira Mix",
    link: "https://www.google.com/search?q=Ghost+band+new+album+single"
  },
  {
    id: "news-6",
    category: "classico",
    catLabel: "Rock Clássico",
    title: "AC/DC incendeia multidões com Brian Johnson e Angus Young em forma espetacular",
    desc: "Aos 69 anos, Angus Young continua correndo de ponta a ponta no palco e executando os solos mais eletrizantes do Hard Rock.",
    thumb: ROCK_THUMBS_LIBRARY.acdc,
    date: "Há 3 dias",
    source: "Classic Rock Magazine",
    link: "https://www.google.com/search?q=ACDC+Power+Up+tour"
  }
];

function formatNewsDate(pubDateStr) {
  if (!pubDateStr) return "Hoje";
  try {
    const d = new Date(pubDateStr);
    if (isNaN(d.getTime())) return pubDateStr;
    const now = new Date();
    const diffHours = Math.floor((now - d) / (1000 * 60 * 60));
    if (diffHours < 1) return "Há poucos minutos";
    if (diffHours < 24) return `Há ${diffHours}h`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return "Ontem";
    if (diffDays < 7) return `Há ${diffDays} dias`;
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  } catch (_) {
    return "Recente";
  }
}

async function fetchLiveRockNews(force = false) {
  const statusEl = $("news-live-status");
  const refreshBtn = $("btn-refresh-news");
  const refreshIcon = refreshBtn?.querySelector(".btn-refresh-icon");

  if (refreshIcon) refreshIcon.classList.add("spinning");
  if (statusEl) statusEl.textContent = "🔄 Consultando notícias de Rock & Metal...";

  try {
    // 1. Verifica cache local recente (15 min) se não for forçado
    if (!force) {
      const cached = localStorage.getItem(NEWS_CACHE_KEY);
      const cachedTime = localStorage.getItem(NEWS_CACHE_TIME_KEY);
      if (cached && cachedTime && Date.now() - Number(cachedTime) < 15 * 60 * 1000) {
        liveRockNewsList = JSON.parse(cached);
        if (liveRockNewsList && liveRockNewsList.length > 0) {
          if (statusEl) statusEl.textContent = `🟢 World News / Feed Rock & Metal (${liveRockNewsList.length} notícias)`;
          renderNews(currentNewsFilter);
          if (refreshIcon) refreshIcon.classList.remove("spinning");
          return;
        }
      }
    }

    let parsedNews = [];
    const worldNewsKey = window.CAVEIRA_CONFIG?.WORLD_NEWS_API_KEY;

    // 2. Tenta World News API (se a chave de API estiver preenchida)
    if (worldNewsKey) {
      try {
        const query = '(rock OR metal OR "heavy metal" OR "hard rock" OR "thrash metal" OR "death metal" OR "rock nacional" OR "punk rock" OR "grunge") AND (band OR banda OR musica OR música OR album OR álbum OR show OR tour OR guitar OR vocalista OR festival)';
        const wnUrl = `https://api.worldnewsapi.com/search-news?api-key=${encodeURIComponent(worldNewsKey)}&text=${encodeURIComponent(query)}&language=pt,en&sort=publish-time&sort-direction=DESC&number=25`;
        const wnRes = await fetch(wnUrl);
        if (wnRes.ok) {
          const wnData = await wnRes.json();
          if (Array.isArray(wnData?.news) && wnData.news.length > 0) {
            parsedNews = wnData.news
              .filter((item) => isStrictlyRock(item.title, item.text || item.summary))
              .map((item, idx) => {
                const title = item.title || "Notícia do Rock";
                const desc = (item.summary || item.text || "").replace(/<[^>]*>/g, "").slice(0, 180) + "…";
                const { category, catLabel } = categorizeNews(title, desc);
                const thumb = getRockThumb(title, desc, item.image);
                return {
                  id: `wn-${item.id || idx}`,
                  category,
                  catLabel,
                  title,
                  desc,
                  thumb,
                  date: formatNewsDate(item.publish_date),
                  source: item.author || item.source_country || "World News Rock",
                  link: item.url
                };
              });
          }
        }
      } catch (wnErr) {
        console.warn("World News API fallback acionado:", wnErr);
      }
    }

    // 3. Fallback inteligente: Feed de Rock & Heavy Metal com filtro estrito de bandas
    if (parsedNews.length === 0) {
      const rssUrl = "https://news.google.com/rss/search?q=rock+OR+%22heavy+metal%22+OR+%22hard+rock%22+OR+metallica+OR+%22iron+maiden%22+OR+sepultura+OR+whiplash&hl=pt-BR&gl=BR&ceid=BR:pt-419";
      const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}&api_key=&count=25`;

      const res = await fetch(apiUrl, { cache: "no-store" });
      if (!res.ok) throw new Error("bad feed status");
      const data = await res.json();

      if (data.status === "ok" && Array.isArray(data.items) && data.items.length > 0) {
        parsedNews = data.items
          .filter((item) => isStrictlyRock(item.title, item.description || item.content))
          .map((item, idx) => {
            const rawTitle = item.title || "Notícia de Rock";
            const cleanTitle = rawTitle.replace(/ - [^-]+$/, "").trim();
            const sourceName = rawTitle.includes(" - ") ? rawTitle.split(" - ").pop().trim() : (data.feed?.title || "Mundo do Rock");

            const rawDesc = (item.description || item.content || "")
              .replace(/<[^>]*>/g, "")
              .replace(/&nbsp;/g, " ")
              .trim();
            const cleanDesc = rawDesc.length > 180 ? rawDesc.slice(0, 180) + "…" : rawDesc || "Confira todos os detalhes desta novidade do rock.";

            const { category, catLabel } = categorizeNews(cleanTitle, cleanDesc);
            const thumb = getRockThumb(cleanTitle, cleanDesc, item.thumbnail || item.enclosure?.link);
            const date = formatNewsDate(item.pubDate);

            return {
              id: `live-news-${idx}`,
              category,
              catLabel,
              title: cleanTitle,
              desc: cleanDesc,
              thumb,
              date,
              source: sourceName,
              link: item.link || `https://www.google.com/search?q=${encodeURIComponent(cleanTitle)}`
            };
          });
      }
    }

    if (parsedNews.length > 0) {
      liveRockNewsList = parsedNews;
      localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify(parsedNews));
      localStorage.setItem(NEWS_CACHE_TIME_KEY, String(Date.now()));
      const apiLabel = worldNewsKey ? "World News API" : "Feed Oficial";
      if (statusEl) statusEl.textContent = `🟢 ${apiLabel} (Filtrado: Rock & Metal • ${parsedNews.length} matérias)`;
    } else {
      throw new Error("nenhuma matéria passou pelo filtro de rock");
    }
  } catch (err) {
    console.warn("Usando contingência de notícias do rock:", err);
    liveRockNewsList = FALLBACK_ROCK_NEWS;
    if (statusEl) statusEl.textContent = "🟢 Modo Offline / Destaques do Rock Atualizados";
  } finally {
    if (refreshIcon) setTimeout(() => refreshIcon.classList.remove("spinning"), 400);
    renderNews(currentNewsFilter);
  }
}

function renderNews(filter = "todas") {
  currentNewsFilter = filter;
  const container = $("news-grid");
  if (!container) return;

  const list = (liveRockNewsList && liveRockNewsList.length > 0) ? liveRockNewsList : FALLBACK_ROCK_NEWS;
  const filtered = filter === "todas" ? list : list.filter((n) => n.category === filter);

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: var(--grey);">
        <p>Nenhuma notícia encontrada nesta categoria no momento.</p>
        <button onclick="fetchLiveRockNews(true)" style="margin-top: 1rem; padding: 0.5rem 1rem; background: var(--red); color: #fff; border: none; border-radius: 8px; cursor: pointer;">Recarregar Notícias</button>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map((n) => `
    <article class="news-card-item">
      <div class="news-thumb-wrap">
        <img class="news-thumb" src="${n.thumb}" alt="${escapeHtml(n.title)}" loading="lazy" onerror="this.src='${ROCK_THUMBS_LIBRARY.metal}'" />
        <span class="news-tag">${n.catLabel}</span>
        <span class="news-date-badge">🕒 ${n.date}</span>
      </div>
      <div class="news-body">
        <h3 class="news-item-title">${escapeHtml(n.title)}</h3>
        <p class="news-item-desc">${escapeHtml(n.desc)}</p>
        <div class="news-item-footer">
          <span class="news-source">📰 ${escapeHtml(n.source)}</span>
          <a class="news-read-more" href="${n.link}" target="_blank" rel="noopener">
            Ler matéria ➔
          </a>
        </div>
      </div>
    </article>
  `).join("");
}

// Botão de atualização manual
const btnRefresh = $("btn-refresh-news");
if (btnRefresh) {
  btnRefresh.addEventListener("click", () => fetchLiveRockNews(true));
}

// Polling periódico a cada 10 minutos
setInterval(() => fetchLiveRockNews(false), 10 * 60 * 1000);

/* ============================================================
   CURIOSIDADES & BASTIDORES DO ROCK (BANCO EXPANDIDO)
   ============================================================ */
const TRIVIA_DATABASE = [
  {
    band: "Black Sabbath • 1970",
    tag: "⚡ Origem do Metal",
    title: "O acidente de trabalho que inventou o Heavy Metal",
    text: "No seu último dia de trabalho em uma metalúrgica em Birmingham, Tony Iommi perdeu as pontas de dois dedos. Para conseguir tocar sem dor, ele confeccionou próteses de plástico caseiras e afinou sua guitarra três semitons abaixo, criando o som grave e sinistro que deu origem ao Heavy Metal mundial."
  },
  {
    band: "Ozzy Osbourne • 1982",
    tag: "🦇 Loucura nos Palcos",
    title: "O infame episódio do morcego no palco",
    text: "Durante um show em Iowa, um fã jogou um morcego no palco. Ozzy, achando que se tratava de um brinquedo de borracha, mordeu a cabeça do animal. O cantor teve que ser levado às pressas ao hospital para tomar uma dolorosa série de vacinas antirrábicas."
  },
  {
    band: "Iron Maiden • 1982",
    tag: "💀 Mistério de Estúdio",
    title: "Fenômenos bizarros durante 'The Number of the Beast'",
    text: "Durante as gravações em Londres, luzes do estúdio acendiam sozinhas e amplificadores captavam vozes estranhas. Para completar, o produtor Martin Birch bateu o carro após uma sessão e a conta da oficina deu exatamente £666. Assustado, ele pediu para cobrarem £667!"
  },
  {
    band: "Metallica • 1986",
    tag: "🃏 Destino Trágico",
    title: "O baralho que selou a história no ônibus de turnê",
    text: "Na Suécia em 1986, Cliff Burton e Kirk Hammett tiraram cartas para decidir quem dormiria na melhor cama do ônibus da turnê. Cliff tirou o Ás de Espadas e escolheu o beliche junto à janela. Horas depois, o ônibus derrapou no gelo e sofreu o trágico acidente fatal."
  },
  {
    band: "Guns N' Roses • 1987",
    tag: "🎸 Criação Inesperada",
    title: "O riff mais famoso que Slash detestava",
    text: "Slash criou o icônico riff de introdução de 'Sweet Child O' Mine' apenas como um exercício de aquecimento bobo para os dedos. Axl Rose ouviu do andar de cima e imediatamente começou a escrever a letra no chão da sala."
  },
  {
    band: "Nirvana • 1991",
    tag: "🔥 Curiosidade Grunge",
    title: "O desodorante feminino que batizou o maior hino dos anos 90",
    text: "Kathleen Hanna (amiga de Kurt Cobain) grafitou na parede do quarto dele: 'Kurt smells like Teen Spirit'. Kurt achou a frase revolucionária e escreveu a música, sem saber que 'Teen Spirit' era simplesmente uma marca de desodorante feminino que sua namorada usava!"
  },
  {
    band: "Dio • 1979",
    tag: "🤘 Símbolo Sagrado",
    title: "Como Ronnie James Dio popularizou o 'Mano Cornuta'",
    text: "Ao entrar no Black Sabbath substituindo Ozzy, Dio queria sua própria marca registrada. Ele adotou o gesto que sua avó italiana usava (o Maloik), um antigo amuleto de proteção para afastar o mau-olhado, e transformou-o no símbolo universal de todos os metaleiros."
  },
  {
    band: "Deep Purple • 1971",
    tag: "🔥 Incêndio Real",
    title: "A fumaça sobre a água em Montreux",
    text: "'Smoke on the Water' narra uma história 100% real: a banda estava em Montreux (Suíça) para gravar com o estúdio móvel dos Rolling Stones quando um fã disparou um sinalizador no show de Frank Zappa e incendiou todo o cassino sobre o lago Genebra."
  },
  {
    band: "AC/DC • 1974",
    tag: "👔 Visual Histórico",
    title: "O famoso uniforme colegial de Angus Young",
    text: "Nos primeiros ensaios em Sydney, Angus Young saía direto da escola para tocar e não tinha tempo de trocar de roupa. Sua irmã Margaret sugeriu que ele mantivesse o uniforme escolar de calça curta, criando uma das figuras visuais mais marcantes de todos os tempos."
  },
  {
    band: "Sepultura • 1996",
    tag: "🇧🇷 Raízes Nacionais",
    title: "O ritual sagrado gravado com a tribo Xavante",
    text: "Para gravar a faixa 'Itsári' do clássico álbum 'Roots', os integrantes do Sepultura viajaram até a aldeia indígena Pimentel Barbosa no Mato Grosso, vivendo dias com a tribo Xavante e gravando seus cantos ancestrais sob autorização do cacique."
  },
  {
    band: "Slipknot • 1995",
    tag: "🎭 Máscaras Sombrias",
    title: "Como nasceu a ideia das máscaras do Slipknot",
    text: "Tudo começou quando o percussionista Shawn 'Clown' Crahan apareceu em um ensaio usando uma máscara de palhaço apenas para irritar e assustar seus colegas de banda em Des Moines. A banda achou a energia tão intimidadora que todos decidiram criar suas próprias personas mascaradas."
  },
  {
    band: "Motörhead • 1980",
    tag: "🥃 Lenda Viva",
    title: "O diagnóstico inacreditável dos médicos de Lemmy",
    text: "Diz a lenda do rock que, durante um check-up nos anos 80, os médicos avisaram Lemmy Kilmister que o nível de toxinas em seu corpo após anos de Jack Daniel's diário era tão absurdo que doar sangue mataria uma pessoa normal, e que uma transfusão de sangue limpo causaria um choque no seu próprio sistema!"
  },
  {
    band: "Pantera • 1990",
    tag: "🔥 Reinvenção Brutal",
    title: "A queima do passado de Glam Metal",
    text: "Antes de Cowboys From Hell, o Pantera passou anos tocando Glam Metal com roupas de lycra e cabelos descoloridos no Texas. Em 1990, Dimebag Darrell e Phil Anselmo decidiram rasgar e queimar todo o visual antigo e afinar as guitarras com o 'Dime-bucker', inventando o Groove Metal."
  },
  {
    band: "Queen • 1975",
    tag: "🎼 Perfeccionismo",
    title: "A fita que ficou transparente em Bohemian Rhapsody",
    text: "Freddie Mercury e Brian May sobrepuseram mais de 180 faixas de vocais em fitas analógicas de 24 canais para criar os coros operísticos de Bohemian Rhapsody. A fita foi passada tantas vezes pelos cabeçotes do gravador que a camada de óxido de ferro desgastou e ela ficou quase transparente!"
  },
  {
    band: "Judas Priest • 1978",
    tag: "⛓️ Estética Metal",
    title: "O nascimento do visual de couro e tachas",
    text: "Foi Rob Halford quem comprou as primeiras jaquetas de couro preto pesadas, correntes e cintos de rebites pontiagudos em uma loja especializada no Soho em Londres. Ao subir no palco pilotando uma Harley-Davidson, o Judas Priest oficializou o figurino do Heavy Metal para a eternidade."
  }
];

/* Fato do Dia (Muda automaticamente a cada 24 horas) */
function getDailyTrivia() {
  const dayOfYear = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  return TRIVIA_DATABASE[dayOfYear % TRIVIA_DATABASE.length];
}

/* Sorteia 4 histórias aleatórias e distintas */
function getRandomTrivia(count = 4, excludeTitle = "") {
  const pool = TRIVIA_DATABASE.filter((t) => t.title !== excludeTitle);
  const shuffled = [...pool].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

function renderTrivia() {
  const spotlightEl = $("trivia-daily-spotlight");
  const gridEl = $("trivia-grid");

  const daily = getDailyTrivia();
  if (spotlightEl && daily) {
    spotlightEl.innerHTML = `
      <span class="trivia-spotlight-badge">🌟 FATO DO DIA • ${daily.band}</span>
      <h3 class="trivia-spotlight-title">${daily.title}</h3>
      <p class="trivia-spotlight-text">${daily.text}</p>
    `;
  }

  const randoms = getRandomTrivia(4, daily.title);
  if (gridEl) {
    gridEl.innerHTML = randoms.map((t) => `
      <div class="trivia-card">
        <span class="trivia-band">${t.tag} • ${t.band}</span>
        <h3 class="trivia-title">${t.title}</h3>
        <p class="trivia-text">${t.text}</p>
      </div>
    `).join("");
  }
}

/* Botão de Sortear Novas Histórias */
const btnShuffle = $("btn-shuffle-trivia");
if (btnShuffle) {
  btnShuffle.addEventListener("click", () => {
    const dice = btnShuffle.querySelector(".btn-dice");
    if (dice) dice.style.transform = "rotate(360deg)";
    renderTrivia();
    setTimeout(() => { if (dice) dice.style.transform = ""; }, 400);
  });
}

/* ============================================================
   RADAR DE SHOWS & BUSCADOR DE TURNÊS
   ============================================================ */
const FESTIVALS_DATA = [
  {
    date: "MAIO DE 2025 / 2026",
    name: "Bangers Open Air Brasil",
    location: "Memorial da América Latina • São Paulo / SP",
    lineup: "Saxon, Sabaton, Powerwolf, Kamelot, I Prevail, Blind Guardian, Doro e mais de 30 bandas."
  },
  {
    date: "OUTUBRO DE 2025 / 2026",
    name: "Knotfest Brasil",
    location: "Allianz Parque • São Paulo / SP",
    lineup: "Slipknot (comemorando 25 anos do 1º álbum), Bad Omens, Mudvayne, Amon Amarth, Poppy."
  },
  {
    date: "NOVEMBRO / DEZEMBRO",
    name: "Iron Maiden — Future Past / 50 Years Tour",
    location: "Estádios e Arenas pela América Latina",
    lineup: "Superprodução histórica celebrando os 50 anos de carreira da Donzela de Ferro."
  },
  {
    date: "ABRIL / MAIO",
    name: "Monsters of Rock Brasil",
    location: "São Paulo / Curitiba / Rio de Janeiro",
    lineup: "O lendário festival trazendo lendas mundiais do Hard Rock e Heavy Metal clássico."
  }
];

function renderFestivals() {
  const container = $("festivals-grid");
  if (!container) return;
  container.innerHTML = FESTIVALS_DATA.map((f) => `
    <div class="fest-card glass">
      <span class="fest-date">📅 ${f.date}</span>
      <h3 class="fest-name">${f.name}</h3>
      <span class="fest-loc">📍 ${f.location}</span>
      <p class="fest-lineup"><strong>Destaques:</strong> ${f.lineup}</p>
    </div>
  `).join("");
}

/* Buscador de Shows por Banda */
async function searchBandTour(bandName) {
  const resultsBox = $("tour-results");
  if (!resultsBox) return;
  const q = (bandName || "").trim();
  if (!q) { resultsBox.style.display = "none"; return; }

  resultsBox.style.display = "block";
  resultsBox.innerHTML = `
    <div class="tour-results-header">
      <h4 class="tour-results-title">🔍 Buscando turnê de: <span style="color: var(--red-glow);">${escapeHtml(q)}</span>...</h4>
    </div>
    <p class="muted">Consultando datas de turnê e eventos ao vivo...</p>
  `;

  try {
    // Consulta à API de eventos do MusicBrainz
    const res = await fetch(`https://musicbrainz.org/ws/2/event/?query=artist:"${encodeURIComponent(q)}"&fmt=json&limit=6`, {
      headers: { "User-Agent": "CaveiraMixRadio/2.0 ( https://caveira-mix.uk )" }
    }).then(r => r.json());

    const events = res?.events || [];
    const bandQuery = encodeURIComponent(q);

    if (events.length > 0) {
      const cards = events.map(ev => {
        const time = ev["life-span"]?.begin || "Data a confirmar";
        const name = ev.name || `Show ${q}`;
        const place = ev.relations?.find(r => r.place)?.place?.name || "Arena / Estádio";
        return `
          <div class="tour-event-card">
            <span class="tour-event-date">📅 ${time}</span>
            <h5 class="tour-event-venue">${escapeHtml(name)}</h5>
            <span class="tour-event-loc">📍 ${escapeHtml(place)}</span>
            <div class="tour-event-links">
              <a class="tour-event-btn" href="https://www.google.com/search?q=${bandQuery}+tickets+tour+dates" target="_blank" rel="noopener">
                🎟️ Ingressos & Cidades
              </a>
              <a class="tour-event-btn" href="https://www.setlist.fm/search?query=${bandQuery}" target="_blank" rel="noopener">
                🎸 Setlist Recente
              </a>
            </div>
          </div>
        `;
      }).join("");

      resultsBox.innerHTML = `
        <div class="tour-results-header">
          <h4 class="tour-results-title">📡 Datas e Turnês Encontradas para: <span style="color: var(--red-glow);">${escapeHtml(q)}</span></h4>
          <span style="font-size: 0.75rem; color: var(--grey);">${events.length} evento(s) listados</span>
        </div>
        <div class="tour-events-list">${cards}</div>
      `;
    } else {
      // Exibe links diretos de turnê para a banda pesquisada
      resultsBox.innerHTML = `
        <div class="tour-results-header">
          <h4 class="tour-results-title">🎸 Radar de Turnê: <span style="color: var(--red-glow);">${escapeHtml(q)}</span></h4>
        </div>
        <p style="color: #e4e4ea; font-size: 0.88rem; margin-bottom: 1rem;">
          Confira o calendário oficial completo, ingressos e cidades confirmadas da turnê de <strong>${escapeHtml(q)}</strong> nos canais oficiais:
        </p>
        <div class="tour-events-list">
          <div class="tour-event-card">
            <span class="tour-event-date">🌐 TURNÊ MUNDIAL 2025 / 2026</span>
            <h5 class="tour-event-venue">${escapeHtml(q)} Tour Dates</h5>
            <span class="tour-event-loc">📍 Brasil e Turnê Internacional</span>
            <div class="tour-event-links">
              <a class="tour-event-btn" href="https://www.google.com/search?q=${bandQuery}+shows+brasil+ingressos" target="_blank" rel="noopener">
                🇧🇷 Shows no Brasil
              </a>
              <a class="tour-event-btn" href="https://www.google.com/search?q=${bandQuery}+official+tour+dates" target="_blank" rel="noopener">
                🌍 Turnê Mundial
              </a>
              <a class="tour-event-btn" href="https://www.setlist.fm/search?query=${bandQuery}" target="_blank" rel="noopener">
                🎼 Últimos Setlists
              </a>
            </div>
          </div>
        </div>
      `;
    }
  } catch (_) {
    resultsBox.innerHTML = `
      <div class="tour-results-header">
        <h4 class="tour-results-title">🎸 Radar de Turnê: <span style="color: var(--red-glow);">${escapeHtml(q)}</span></h4>
      </div>
      <div class="tour-events-list">
        <div class="tour-event-card">
          <span class="tour-event-date">🌐 INGRESSOS E DATAS</span>
          <h5 class="tour-event-venue">Buscar agenda de ${escapeHtml(q)}</h5>
          <div class="tour-event-links">
            <a class="tour-event-btn" href="https://www.google.com/search?q=${encodeURIComponent(q)}+shows+brasil" target="_blank" rel="noopener">
              🎟️ Buscar Ingressos e Cidades
            </a>
          </div>
        </div>
      </div>
    `;
  }
}

function escapeHtml(str = "") {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* Event listeners da busca de turnês */
const tourInput = $("tour-search-input");
const tourBtn = $("tour-search-btn");
if (tourBtn && tourInput) {
  tourBtn.addEventListener("click", () => searchBandTour(tourInput.value));
  tourInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") searchBandTour(tourInput.value);
  });
}
document.querySelectorAll(".tour-quick-pill").forEach((pill) => {
  pill.addEventListener("click", () => {
    const band = pill.dataset.band || pill.textContent;
    if (tourInput) tourInput.value = band;
    searchBandTour(band);
  });
});

/* ============================================================
   FILTERS EVENT LISTENERS
   ============================================================ */
function setupFilters() {
  document.querySelectorAll("[data-news-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-news-filter]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderNews(btn.dataset.newsFilter);
    });
  });

  document.querySelectorAll("[data-album-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-album-filter]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderAlbums(btn.dataset.albumFilter);
    });
  });
}

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  fetchLiveRockNews();
  renderAlbums();
  renderTrivia();
  renderFestivals();
  setupFilters();
  const yr = $("news-year");
  if (yr) yr.textContent = new Date().getFullYear();
});
