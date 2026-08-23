/*
 * Configuração da Caveira Mix
 *
 * ⚠️  CHAVES PRIVADAS
 * As chaves sensíveis (OPENWEATHER, SUPABASE, WORLD_NEWS etc.) NÃO ficam
 * mais hardcoded aqui. Elas são injetadas pelo Cloudflare Pages Worker
 * via window.__ENV antes de o browser executar este script.
 *
 * • Desenvolvimento local → adicione as chaves em .dev.vars (já no .gitignore)
 *   e rode:  npx wrangler pages dev ./public --local
 * • Produção (Cloudflare) → configure cada variável em:
 *   Dashboard → Pages → caveira-mix → Settings → Environment Variables → Add secret
 *
 * Valores não-sensíveis (URLs públicas, textos etc.) continuam aqui normalmente.
 */

// Referência ao bloco injetado pelo Worker (ou objeto vazio em dev sem Wrangler)
const __ENV = window.__ENV || {};

window.CAVEIRA_CONFIG = {
  // --- Stream de áudio ---
  STREAM_URL: "https://caveira-mix.uk/listen/caveira_mix/radio.mp3",

  // --- API AzuraCast (Now Playing) ---
  NOWPLAYING_URL: "https://caveira-mix.uk/api/nowplaying/1",
  REFRESH_MS: 10000,

  // --- QR Code ---
  QR_TARGET: "https://caveira-mix.uk/listen/caveira_mix/radio.mp3",

  // --- Compartilhamento ---
  SHARE_URL: "https://caveira-mix.uk/",
  SHARE_TEXT: "🤘 Ouça a Caveira Mix — Rock, Metal & Underground 24h ao vivo!",

  // --- Chaves de API (lidas do Cloudflare Secret / .dev.vars) ---
  OPENWEATHER_API_KEY: __ENV.OPENWEATHER_API_KEY || "",
  WEATHER_CITY: "Sao Paulo,BR",

  LASTFM_API_KEY:    __ENV.LASTFM_API_KEY    || "",
  WORLD_NEWS_API_KEY: __ENV.WORLD_NEWS_API_KEY || "",
  GNEWS_API_KEY:     __ENV.GNEWS_API_KEY     || "",
  NEWSAPI_KEY:       __ENV.NEWSAPI_KEY       || "",
  NEWS_COUNTRY: "br",

  // --- AzuraCast ---
  AZURACAST_STATION_ID: "1",
  AZURACAST_BASE_URL: "https://caveira-mix.uk",
  AZURACAST_API_KEY: __ENV.AZURACAST_API_KEY || "",

  // --- Acervo de bandas ---
  MUSIC_ROOT: "",
  BAND_FOLDERS: [
    "AC_DC",
    "Alice In Chains",
    "Black Sabbath",
    "Dio",
    "Iron Maiden",
    "Metallica",
    "Motörhead",
    "Nirvana",
    "Scorpions",
    "Sepultura",
    "Soulfly",
    "System Of A Down",
    "Violent Vira",
  ],

  // --- Buscador de playlist ---
  PLAYLIST_FINDER_URL: "https://discography-finder.ai.studio/",

  // --- Cache de capas ---
  COVER_CACHE_TTL_DAYS: 7,

  // --- Supabase (lidas do Cloudflare Secret / .dev.vars) ---
  SUPABASE_URL:      __ENV.SUPABASE_URL      || "",
  SUPABASE_ANON_KEY: __ENV.SUPABASE_ANON_KEY || "",
  SUPABASE_TABLE_SPONSORS:       "patrocinadores",
  SUPABASE_TABLE_LED:            "letreiro_led",
  SUPABASE_TABLE_COMMENTS:       "comentarios_mural",
  SUPABASE_TABLE_COMMENTS_LIKES: "comentarios_likes",

  // --- Contato de patrocínio ---
  SPONSOR_CONTACT_URL: "https://wa.me/?text=Olá!%20Gostaria%20de%20anunciar%20na%20Caveira%20Mix",
};
