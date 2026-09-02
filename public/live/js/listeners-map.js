/* ============================================================
   Caveira Mix — Mapa dos Ouvintes em Tempo Real (Leaflet + IP Geolocation + Supabase Realtime/Polling)
   Com privacidade (offset/ruído 5-20km, arredondamento 2 casas) e agrupamento por cidade/estado.
   ============================================================ */
(function () {
  const CFG = window.CAVEIRA_CONFIG || {};

  // Identificador único e persistente por navegador (reutilizado em F5/recarregamento para não duplicar ouvintes)
  const SESSION_KEY = "cav_map_client_v2";
  let sessionId = localStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = "cav_" + Math.random().toString(36).substring(2, 11) + "_" + Date.now().toString(36);
    localStorage.setItem(SESSION_KEY, sessionId);
  }

  // Centros metropolitanos base (para agrupamento e fallback inteligente com rádio ao vivo)
  const KNOWN_METRO_HUBS = {
    "sao paulo_br": { city: "São Paulo", state: "SP", country: "Brasil", flag: "🇧🇷", lat: -23.55, lng: -46.63, vibe: "Heavy Metal & Thrash" },
    "rio de janeiro_br": { city: "Rio de Janeiro", state: "RJ", country: "Brasil", flag: "🇧🇷", lat: -22.91, lng: -43.17, vibe: "Classic Rock & Grunge" },
    "curitiba_br": { city: "Curitiba", state: "PR", country: "Brasil", flag: "🇧🇷", lat: -25.43, lng: -49.27, vibe: "Death Metal & Industrial" },
    "belo horizonte_br": { city: "Belo Horizonte", state: "MG", country: "Brasil", flag: "🇧🇷", lat: -19.92, lng: -43.93, vibe: "Sepultura & Underground" },
    "porto alegre_br": { city: "Porto Alegre", state: "RS", country: "Brasil", flag: "🇧🇷", lat: -30.03, lng: -51.22, vibe: "Hard Rock & Metal" },
    "brasilia_br": { city: "Brasília", state: "DF", country: "Brasil", flag: "🇧🇷", lat: -15.80, lng: -47.89, vibe: "Rock Nacional & Punk" },
    "salvador_br": { city: "Salvador", state: "BA", country: "Brasil", flag: "🇧🇷", lat: -12.98, lng: -38.50, vibe: "Metal & Hardcore" },
    "recife_br": { city: "Recife", state: "PE", country: "Brasil", flag: "🇧🇷", lat: -8.05, lng: -34.88, vibe: "Underground & Punk" },
    "florianopolis_br": { city: "Florianópolis", state: "SC", country: "Brasil", flag: "🇧🇷", lat: -27.60, lng: -48.55, vibe: "Progressive Rock" },
    "fortaleza_br": { city: "Fortaleza", state: "CE", country: "Brasil", flag: "🇧🇷", lat: -3.73, lng: -38.53, vibe: "Heavy Metal" },
    "campinas_br": { city: "Campinas", state: "SP", country: "Brasil", flag: "🇧🇷", lat: -22.91, lng: -47.06, vibe: "Metalcore" },
    "buenos aires_ar": { city: "Buenos Aires", country: "Argentina", flag: "🇦🇷", lat: -34.60, lng: -58.38, vibe: "Heavy & Nu-Metal" },
    "santiago_cl": { city: "Santiago", country: "Chile", flag: "🇨🇱", lat: -33.45, lng: -70.67, vibe: "Thrash Metal" },
    "cidade do mexico_mx": { city: "Cidade do México", country: "México", flag: "🇲🇽", lat: 19.43, lng: -99.13, vibe: "Death Metal & Classic" },
    "los angeles_us": { city: "Los Angeles", state: "CA", country: "EUA", flag: "🇺🇸", lat: 34.05, lng: -118.24, vibe: "Glam & Thrash" },
    "nova york_us": { city: "Nova York", state: "NY", country: "EUA", flag: "🇺🇸", lat: 40.71, lng: -74.01, vibe: "Hardcore & Punk" },
    "londres_gb": { city: "Londres", country: "Reino Unido", flag: "🇬🇧", lat: 51.51, lng: -0.13, vibe: "NWOBHM & Black Sabbath" },
    "lisboa_pt": { city: "Lisboa", country: "Portugal", flag: "🇵🇹", lat: 38.72, lng: -9.14, vibe: "Rock & Heavy Metal" },
    "porto_pt": { city: "Porto", country: "Portugal", flag: "🇵🇹", lat: 41.16, lng: -8.63, vibe: "Hard Rock" },
    "berlim_de": { city: "Berlim", country: "Alemanha", flag: "🇩🇪", lat: 52.52, lng: 13.41, vibe: "Krautrock & Industrial" },
    "helsinque_fi": { city: "Helsinque", country: "Finlândia", flag: "🇫🇮", lat: 60.17, lng: 24.94, vibe: "Symphonic Metal" },
    "estocolmo_se": { city: "Estocolmo", country: "Suécia", flag: "🇸🇪", lat: 59.33, lng: 18.07, vibe: "Melodic Death Metal" },
    "toquio_jp": { city: "Tóquio", country: "Japão", flag: "🇯🇵", lat: 35.68, lng: 139.65, vibe: "Visual Kei & Heavy Metal" },
  };

  const REGION_VIEWS = {
    all: { center: [20, 0], zoom: 2 },
    br: { center: [-15.5, -50], zoom: 4 },
    americas: { center: [8, -75], zoom: 3 },
    eu: { center: [50, 10], zoom: 4 },
  };

  let map = null;
  let markersLayerGroup = null;
  let userMarker = null;
  let localUserLocation = null;
  let isGeoDetecting = false;
  let currentGroupedHubs = [];

  /* ============================================================
     1. PRIVACY-FIRST IP GEOLOCATION (Ruído + Arredondamento)
     ============================================================ */
  function applyPrivacyNoiseAndRound(lat, lng) {
    // Adiciona um ruído determinístico de 5km a 15km (+/- 0.04 a 0.12 graus)
    // para nunca apontar para a residência exata do ouvinte
    const seed = (Math.abs(Math.sin(lat * 12.9898 + lng * 78.233)) * 43758.5453) % 1;
    const noiseLat = (seed - 0.5) * 0.08;
    const noiseLng = ((seed * 1.5) % 1 - 0.5) * 0.08;

    // Arredonda para 2 casas decimais (~1.1 km de precisão geométrica)
    const finalLat = Math.round((lat + noiseLat) * 100) / 100;
    const finalLng = Math.round((lng + noiseLng) * 100) / 100;

    return { lat: finalLat, lng: finalLng };
  }

  function getFlagEmoji(countryCode) {
    if (!countryCode || countryCode.length !== 2) return "📍";
    const codePoints = countryCode
      .toUpperCase()
      .split("")
      .map((char) => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
  }

  async function fetchUserIPGeolocation() {
    if (localUserLocation || isGeoDetecting) return localUserLocation;
    isGeoDetecting = true;

    // Provedores de IP Geolocation gratuitos e sem permissão invasiva
    const providers = [
      async () => {
        const res = await fetch("https://ipapi.co/json/", { cache: "force-cache" });
        if (!res.ok) throw new Error("ipapi falhou");
        const d = await res.json();
        return {
          city: d.city || "São Paulo",
          state: d.region_code || d.region || "",
          country: d.country_name || "Brasil",
          countryCode: d.country_code || "BR",
          rawLat: parseFloat(d.latitude),
          rawLng: parseFloat(d.longitude),
        };
      },
      async () => {
        const res = await fetch("https://ipwho.is/", { cache: "force-cache" });
        if (!res.ok) throw new Error("ipwho falhou");
        const d = await res.json();
        if (!d.success) throw new Error("ipwho error");
        return {
          city: d.city || "São Paulo",
          state: d.region_code || d.region || "",
          country: d.country || "Brasil",
          countryCode: d.country_code || "BR",
          rawLat: parseFloat(d.latitude),
          rawLng: parseFloat(d.longitude),
        };
      },
    ];

    for (const fn of providers) {
      try {
        const geo = await fn();
        if (geo && !isNaN(geo.rawLat) && !isNaN(geo.rawLng)) {
          const obfuscated = applyPrivacyNoiseAndRound(geo.rawLat, geo.rawLng);
          localUserLocation = {
            city: geo.city,
            state: geo.state,
            country: geo.country,
            countryCode: geo.countryCode,
            flag: getFlagEmoji(geo.countryCode),
            lat: obfuscated.lat,
            lng: obfuscated.lng,
          };
          break;
        }
      } catch (_) {
        // Tenta próximo provedor
      }
    }

    isGeoDetecting = false;

    // Fallback padrão se todos falharem
    if (!localUserLocation) {
      localUserLocation = {
        city: "São Paulo",
        state: "SP",
        country: "Brasil",
        countryCode: "BR",
        flag: "🇧🇷",
        lat: -23.55,
        lng: -46.63,
      };
    }

    window.CAVEIRA_USER_LOCATION = localUserLocation;
    try {
      window.dispatchEvent(new CustomEvent("caveira:location_ready", { detail: localUserLocation }));
    } catch (_) {}

    updateUserLocationUI();
    return localUserLocation;
  }

  window.fetchCaveiraUserLocation = fetchUserIPGeolocation;

  function updateUserLocationUI() {
    if (!localUserLocation) return;
    const badge = document.getElementById("user-location-badge");
    if (badge) {
      badge.innerHTML = `📍 <strong>Você:</strong> ${localUserLocation.flag} ${localUserLocation.city}${localUserLocation.state ? " - " + localUserLocation.state : ""} (${localUserLocation.country})`;
    }
  }

  /* ============================================================
     2. SUPABASE HEARTBEAT & SINCRONIZAÇÃO EM TEMPO REAL
     ============================================================ */
  // Utilitário: fetch com timeout para redes lentas
  function fetchWithTimeout(url, options, timeoutMs = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal })
      .finally(() => clearTimeout(timer));
  }

  async function sendHeartbeatToSupabase(userLoc) {
    const supabaseUrl = (CFG.SUPABASE_URL || "").trim().replace(/\/+$/, "");
    const supabaseKey = (CFG.SUPABASE_ANON_KEY || "").trim();
    if (!supabaseUrl || !supabaseKey || !userLoc) {
      console.warn("[CaveiraMix] Heartbeat ignorado: Supabase URL ou Key ausente.", { supabaseUrl: !!supabaseUrl, supabaseKey: !!supabaseKey });
      return;
    }

    try {
      const endpoint = `${supabaseUrl}/rest/v1/ouvintes_online`;
      const payload = {
        session_id: sessionId,
        cidade: userLoc.city,
        estado: userLoc.state || "",
        pais: userLoc.country,
        codigo_pais: userLoc.countryCode,
        lat: userLoc.lat,
        lng: userLoc.lng,
        ouvindo: true,
        last_ping: new Date().toISOString(),
      };

      const res = await fetchWithTimeout(endpoint, {
        method: "POST",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
          // return=minimal evita body de resposta; resolution=merge-duplicates faz upsert pelo PK
          Prefer: "return=minimal,resolution=merge-duplicates",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "(sem corpo)");
        console.error(`[CaveiraMix] Heartbeat falhou: HTTP ${res.status}`, errText);
      }
    } catch (err) {
      console.error("[CaveiraMix] Erro ao enviar heartbeat:", err.message || err);
    }
  }

  // Desconecta ouvinte imediatamente quando a aba/navegador for fechado
  function disconnectUser() {
    const supabaseUrl = (CFG.SUPABASE_URL || "").trim().replace(/\/+$/, "");
    const supabaseKey = (CFG.SUPABASE_ANON_KEY || "").trim();
    if (!supabaseUrl || !supabaseKey || !sessionId) return;

    const endpoint = `${supabaseUrl}/rest/v1/ouvintes_online?session_id=eq.${sessionId}`;
    
    // Tenta usar sendBeacon para saída garantida mesmo fechando a janela
    if (navigator.sendBeacon) {
      // Supabase REST DELETE via fetch/beacon
      fetch(endpoint, {
        method: "DELETE",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
        keepalive: true,
      }).catch(() => {});
    }
  }

  // Registra eventos de saída para desconexão imediata
  window.addEventListener("pagehide", disconnectUser);
  window.addEventListener("beforeunload", disconnectUser);

  async function fetchOnlineListenersFromSupabase() {
    const supabaseUrl = (CFG.SUPABASE_URL || "").trim().replace(/\/+$/, "");
    const supabaseKey = (CFG.SUPABASE_ANON_KEY || "").trim();
    if (!supabaseUrl || !supabaseKey) {
      console.warn("[CaveiraMix] fetchListeners ignorado: Supabase URL ou Key ausente.");
      return null;
    }

    try {
      // Considera ativo apenas quem enviou heartbeat nos últimos 45 segundos (tempo real ultra preciso)
      const since = new Date(Date.now() - 45 * 1000).toISOString();
      const endpoint = `${supabaseUrl}/rest/v1/ouvintes_online?select=*&last_ping=gte.${encodeURIComponent(since)}&order=last_ping.desc`;
      const res = await fetchWithTimeout(endpoint, {
        method: "GET",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "(sem corpo)");
        console.error(`[CaveiraMix] fetchListeners falhou: HTTP ${res.status}`, errText);
        return null;
      }
      const data = await res.json();
      return Array.isArray(data) ? data : null;
    } catch (err) {
      console.error("[CaveiraMix] Erro ao buscar ouvintes:", err.message || err);
      return null;
    }
  }

  /* ============================================================
     3. AGRUPAMENTO POR CIDADE / ESTADO
     Apenas ouvintes reais (Supabase + usuário local)
     ============================================================ */
  function groupListeners(rawListeners) {
    const realGroups = new Map();
    const hasSupabaseData = Array.isArray(rawListeners);

    // 1. Ouvintes reais vindos do Supabase
    if (hasSupabaseData && rawListeners.length > 0) {
      rawListeners.forEach((item) => {
        if (!item.cidade || !item.pais) return;
        const cityKey = `${item.cidade.toLowerCase().trim()}_${(item.codigo_pais || "").toLowerCase().trim()}`;
        const isThisUser = item.session_id === sessionId;
        const existing = realGroups.get(cityKey);
        
        if (existing) {
          existing.count += 1;
          if (isThisUser) existing.hasUser = true;
        } else {
          const knownKey = Object.keys(KNOWN_METRO_HUBS).find((k) =>
            k.startsWith(
              item.cidade
                .toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/\s+/g, " ")
                .trim()
            )
          );
          const knownHub = knownKey ? KNOWN_METRO_HUBS[knownKey] : null;
          realGroups.set(cityKey, {
            city: item.cidade,
            state: item.estado || (knownHub ? knownHub.state || "" : ""),
            country: item.pais,
            flag: getFlagEmoji(item.codigo_pais),
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lng),
            count: 1,
            real: true,
            hasUser: isThisUser,
            vibe: knownHub ? knownHub.vibe : "Rock & Metal",
          });
        }
      });
    }

    // 2. Fallback: Se o Supabase estiver indisponível ou vazio, adiciona apenas o usuário local
    if (realGroups.size === 0 && localUserLocation) {
      const userKey = `${localUserLocation.city.toLowerCase().trim()}_${localUserLocation.countryCode.toLowerCase().trim()}`;
      const knownKey = Object.keys(KNOWN_METRO_HUBS).find((k) =>
        k.startsWith(
          localUserLocation.city
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/\s+/g, " ")
            .trim()
        )
      );
      const knownHub = knownKey ? KNOWN_METRO_HUBS[knownKey] : null;
      realGroups.set(userKey, {
        city: localUserLocation.city,
        state: localUserLocation.state || "",
        country: localUserLocation.country,
        flag: localUserLocation.flag,
        lat: localUserLocation.lat,
        lng: localUserLocation.lng,
        count: 1,
        real: true,
        hasUser: true,
        vibe: knownHub ? knownHub.vibe : "Rock & Metal",
      });
    }

    const realArray = Array.from(realGroups.values());
    return { real: realArray, decorative: [] };
  }

  /* ============================================================
     4. RENDERIZAÇÃO NO MAPA (Leaflet Markers & Popups)
     ============================================================ */
  function createPulseIcon(hub) {
    const isUser = hub.hasUser || false;
    const count = hub.count || 1;
    const isHot = count >= 8;
    const size = isUser ? 34 : (isHot ? 28 : 22);
    const cls = isUser ? "map-pin-user" : (isHot ? "map-pin-hot" : "map-pin-normal");

    return L.divIcon({
      className: "custom-pulse-marker-wrap",
      html: `
        <div class="map-pulse-node ${cls}" title="${hub.city} - ${count} ${count === 1 ? "ouvinte" : "ouvintes"}">
          <span class="map-pulse-core">${isUser ? "📍" : "🤘"}</span>
          <span class="map-pulse-ring ring-1"></span>
          <span class="map-pulse-ring ring-2"></span>
          <span class="map-pulse-ring ring-3"></span>
        </div>
      `,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      popupAnchor: [0, -size / 2 - 4],
    });
  }

  function renderMarkers({ real, decorative }) {
    if (!map || !markersLayerGroup) return;

    markersLayerGroup.clearLayers();

    // Renderiza todos os hubs (reais + decorativos)
    const allHubs = [...real, ...decorative];

    allHubs.forEach((hub) => {
      const icon = createPulseIcon(hub);
      const marker = L.marker([hub.lat, hub.lng], {
        icon,
        zIndexOffset: hub.hasUser ? 1000 : hub.count * 10,
      });

      const isReal = hub.real !== false;
      const countLabel = isReal
        ? `${hub.count} ${hub.count === 1 ? "ouvinte sintonizado" : "ouvintes sintonizados"}`
        : `~${hub.count} ouvintes na região`;
      const locationLabel = hub.state ? `${hub.city}, ${hub.state} - ${hub.country}` : `${hub.city}, ${hub.country}`;

      const popupHtml = `
        <div class="map-popup-card ${hub.hasUser ? "map-popup-user" : ""}">
          <div class="map-popup-header">
            <span class="map-popup-flag">${hub.flag}</span>
            <div>
              <strong class="map-popup-city">${hub.city}</strong>
              <span class="map-popup-country">${locationLabel}</span>
            </div>
          </div>
          <div class="map-popup-body">
            <div class="map-popup-stat">
              <span class="${hub.hasUser ? "stat-dot-user" : "stat-dot-live"}"></span>
              <strong>${countLabel}</strong>
            </div>
            ${hub.hasUser ? '<div style="color:#00ffff; font-size:0.75rem; font-weight:700;">★ Seu ponto de conexão</div>' : ""}
            <div class="map-popup-vibe">
              <span>🎸 Estilo na região:</span>
              <em>${hub.vibe || "Rock & Metal"}</em>
            </div>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml, {
        className: `caveira-dark-popup ${hub.hasUser ? "caveira-user-popup" : ""}`,
        closeButton: false,
        autoPanPadding: [20, 20],
      });

      marker.on("mouseover", function () {
        this.openPopup();
      });

      markersLayerGroup.addLayer(marker);

      if (hub.hasUser) {
        userMarker = marker;
      }
    });

    // Métricas: APENAS dados reais contam
    updateMetricsDisplay(real);
  }

  function animateCount(el, target) {
    if (!el) return;
    const current = parseInt(el.textContent) || 0;
    if (current === target) return;
    const step = target > current ? 1 : -1;
    const diff = Math.abs(target - current);
    const delay = diff > 20 ? 20 : diff > 5 ? 40 : 80;
    let val = current;
    const tick = setInterval(() => {
      val += step;
      el.textContent = val;
      if (val === target) clearInterval(tick);
    }, delay);
  }

  function updateMetricsDisplay(realHubs) {
    // Conta apenas ouvintes REAIS (vindos do Supabase ou o próprio usuário)
    const totalCountries = new Set(realHubs.map((h) => h.country)).size;
    const totalCities = realHubs.length;
    const totalListeners = realHubs.reduce((acc, h) => acc + (h.count || 1), 0);

    const elCountries = document.getElementById("map-stat-countries");
    const elCities = document.getElementById("map-stat-cities");
    const elGlobal = document.getElementById("map-stat-total");

    // Atualiza com animação de contagem
    animateCount(elCountries, totalCountries);
    animateCount(elCities, totalCities);
    animateCount(elGlobal, totalListeners);

    // Sincroniza também o contador principal 'Ouvindo agora' (topo da página)
    const elMainListeners = document.getElementById("listeners");
    if (elMainListeners) {
      elMainListeners.textContent = totalListeners;
      elMainListeners.style.animation = "none";
      void elMainListeners.offsetWidth;
      elMainListeners.style.animation = "";
    }
  }

  /* ============================================================
     5. POLLING & ATUALIZAÇÃO CONTÍNUA (Sem F5)
     ============================================================ */
  async function syncMapData() {
    try {
      // 1. Envia heartbeat do usuário (se já detectado)
      if (localUserLocation) {
        await sendHeartbeatToSupabase(localUserLocation);
      }

      // 2. Busca ouvintes reais do Supabase
      const remoteListeners = await fetchOnlineListenersFromSupabase();

      // 3. Agrupa separando reais de decorativos e renderiza
      const grouped = groupListeners(remoteListeners);
      currentGroupedHubs = [...grouped.real, ...grouped.decorative];
      renderMarkers(grouped);
    } catch (_) {
      // Falha silenciosa — mantém estado anterior
    }
  }

  function triggerPulseOnHub(hub) {
    if (!map || !hub) return;
    const circle = L.circleMarker([hub.lat, hub.lng], {
      radius: 8,
      fillColor: hub.hasUser ? "#00ffff" : "#ff0040",
      fillOpacity: 0.8,
      color: hub.hasUser ? "#00ffff" : "#ff2d3f",
      weight: 2,
      className: "sound-wave-ripple",
    }).addTo(map);
    setTimeout(() => {
      if (map && circle) map.removeLayer(circle);
    }, 2400);
  }

  // Mantém compatibilidade com chamadas antigas
  function triggerRandomPulse() {
    if (!map || currentGroupedHubs.length === 0) return;
    const hub = currentGroupedHubs[Math.floor(Math.random() * currentGroupedHubs.length)];
    triggerPulseOnHub(hub);
  }

  function startLiveFeedTicker() {
    const feedEl = document.getElementById("map-live-feed-ticker");
    if (!feedEl) return;

    function getCurrentSong() {
      const np = window.CAVEIRA_NOWPLAYING;
      if (np && np.artist && np.title) {
        return { artist: np.artist, title: np.title };
      }
      return null;
    }

    function buildFeedMessage(hub) {
      const song = getCurrentSong();
      const np = window.CAVEIRA_NOWPLAYING;

      // Pool de templates que usam dados 100% reais
      const templates = [];

      // Template 1: ouvinte + música atual (sempre disponível se houver song)
      if (song) {
        templates.push(
          () => `está ouvindo <strong style="color:#ff8b95">${song.artist} - ${song.title}</strong> 🎸`,
          () => `sintonizou ao vivo e curtindo <strong style="color:#ff8b95">${song.artist}</strong> 🤘`,
        );
      }

      // Template 2: histórico recente real
      if (np && np.history && np.history.length > 0) {
        const prev = np.history[Math.floor(Math.random() * Math.min(np.history.length, 3))];
        if (prev && prev.artist && prev.title) {
          templates.push(
            () => `também curtiu <strong style="color:#ff8b95">${prev.artist} - ${prev.title}</strong> antes 🎶`,
          );
        }
      }

      // Template 3: conexão ao vivo
      templates.push(
        () => `conectou à rádio agora 📡`,
        () => `está ouvindo a Caveira Mix 💀`,
      );

      const actionFn = templates[Math.floor(Math.random() * templates.length)];
      return actionFn();
    }

    function nextFeedItem() {
      // Usa apenas hubs reais para o feed
      const realHubs = currentGroupedHubs.filter((h) => h.real !== false);
      if (realHubs.length === 0) return;

      // Escolhe hub real aleatório (ponderado pela contagem)
      const totalWeight = realHubs.reduce((acc, h) => acc + (h.count || 1), 0);
      let rnd = Math.random() * totalWeight;
      let hub = realHubs[realHubs.length - 1];
      for (const h of realHubs) {
        rnd -= h.count || 1;
        if (rnd <= 0) { hub = h; break; }
      }

      const action = buildFeedMessage(hub);
      const locationLabel = hub.state
        ? `${hub.city} - ${hub.state} (${hub.country})`
        : `${hub.city} (${hub.country})`;

      const itemHtml = `
        <span class="feed-pulse-dot"></span>
        <span class="feed-flag">${hub.flag}</span>
        <strong>${locationLabel}</strong>
        <span class="feed-action">${action}</span>
        <span class="feed-time">agora</span>
      `;

      feedEl.classList.remove("fade-in");
      feedEl.innerHTML = itemHtml;
      void feedEl.offsetWidth;
      feedEl.classList.add("fade-in");

      // Pulsa o marcador correspondente no mapa
      triggerPulseOnHub(hub);
    }

    // Aguarda dados reais ficarem disponíveis antes de exibir o primeiro item
    function waitAndStart() {
      if (currentGroupedHubs.some((h) => h.real !== false) && window.CAVEIRA_NOWPLAYING) {
        nextFeedItem();
        setInterval(nextFeedItem, 4500);
      } else {
        setTimeout(waitAndStart, 800);
      }
    }
    waitAndStart();
  }

  function setupMapControls() {
    const filterBtns = document.querySelectorAll("[data-map-view]");
    filterBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        filterBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");

        const viewKey = btn.dataset.mapView;
        const target = REGION_VIEWS[viewKey] || REGION_VIEWS.all;

        if (map) {
          map.flyTo(target.center, target.zoom, {
            duration: 1.4,
            easeLinearity: 0.25,
          });
        }
      });
    });

    const btnMyLoc = document.getElementById("btn-my-location");
    if (btnMyLoc) {
      btnMyLoc.addEventListener("click", async () => {
        if (!localUserLocation) {
          await fetchUserIPGeolocation();
        }
        if (localUserLocation && map) {
          map.flyTo([localUserLocation.lat, localUserLocation.lng], 6, {
            duration: 1.5,
          });
          if (userMarker) userMarker.openPopup();
        }
      });
    }
  }

  /* ============================================================
     6. INICIALIZAÇÃO
     ============================================================ */
  async function initMap() {
    const container = document.getElementById("listeners-leaflet-map");
    if (!container || !window.L) return;

    map = L.map("listeners-leaflet-map", {
      center: [20, 0],
      zoom: 2,
      minZoom: 2,
      maxZoom: 11,
      worldCopyJump: true,
      zoomControl: false,
      attributionControl: false,
    });

    L.control.zoom({ position: "topright" }).addTo(map);

    // Tiles Dark 100% livres e sem exigência de API Key ou Tokens (Esri Dark Canvas + OSM Dark)
    const darkTileUrl = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}";
    const tileLayer = L.tileLayer(darkTileUrl, {
      maxZoom: 16,
      minZoom: 2,
      attribution: "",
    }).addTo(map);

    // Fallback garantido se algum bloco falhar
    tileLayer.on("tileerror", function () {
      if (!tileLayer._fallbackApplied) {
        tileLayer._fallbackApplied = true;
        tileLayer.setUrl("https://{s}.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}.png");
      }
    });

    markersLayerGroup = L.layerGroup().addTo(map);

    setupMapControls();
    startLiveFeedTicker();

    // 1. Detecta geolocalização do usuário em segundo plano
    await fetchUserIPGeolocation();

    // 2. Sincroniza dados iniciais
    await syncMapData();

    // 3. Polling em tempo real rápido a cada 12 segundos (atualização instantânea ao entrar/sair)
    setInterval(syncMapData, 12000);
  }

  function boot() {
    if (window.L) {
      initMap();
    } else {
      window.addEventListener("load", () => {
        if (window.L) initMap();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
