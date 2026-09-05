/* ============================================================
   Caveira Mix — Painel & Letreiro de LED da Administração
   Efeito Dot-Matrix Marquee com sincronização Supabase Realtime
   ============================================================ */

(function () {
  const CFG = window.CAVEIRA_CONFIG || {};

  // Recados e avisos padrão (fallback caso a tabela do Supabase ainda esteja vazia)
  const DEFAULT_BULLETINS = [
    {
      id: "def-1",
      mensagem: "BEM-VINDO À RÁDIO CAVEIRA! A SUA RÁDIO ROCK, METAL & UNDERGROUND 24H NO AR!",
      autor: "Administração",
      tipo: "aviso",
      cor_led: "red",
    },
    {
      id: "def-2",
      mensagem: "PEÇA SUA MÚSICA: Clique na aba 'Pedidos de Músicas' no menu e vote nos clássicos do acervo!",
      autor: "Programação",
      tipo: "promocao",
      cor_led: "amber",
    },
    {
      id: "def-3",
      mensagem: "ESPECIAL SEXTA-FEIRA: Às 20h tem Maratona Especial Black Sabbath, Dio e Iron Maiden!",
      autor: "Locução",
      tipo: "show",
      cor_led: "red",
    },
    {
      id: "def-4",
      mensagem: "COMPARTILHE A RÁDIO CAVEIRA: Chame a galera headbanger para sintonizar a rádio pesada!",
      autor: "Equipe Caveira",
      tipo: "aviso",
      cor_led: "green",
    },
  ];

  let bulletins = [...DEFAULT_BULLETINS];
  let realtimeWs = null;
  let currentColorMode = "red"; // 'red', 'amber', 'green', 'cyan'
  let isFetching = false;

  // Utilitário para limpar e formatar texto no estilo painel de LED
  function formatLedText(text) {
    if (!text) return "";
    return text
      .trim()
      .toUpperCase()
      .replace(/\s+/g, " ");
  }

  // 1. Busca mensagens no Supabase via REST API
  async function fetchBulletinsFromSupabase() {
    const supabaseUrl = (CFG.SUPABASE_URL || "").trim().replace(/\/+$/, "");
    const supabaseKey = (CFG.SUPABASE_ANON_KEY || "").trim();
    const tableName = (CFG.SUPABASE_TABLE_LED || "letreiro_led").trim();

    if (!supabaseUrl || !supabaseKey) {
      return DEFAULT_BULLETINS;
    }

    try {
      const endpoint = `${supabaseUrl}/rest/v1/${tableName}?select=*&ativo=eq.true&order=ordem.asc,created_at.asc`;
      const res = await fetch(endpoint, {
        method: "GET",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data;
      }
      return DEFAULT_BULLETINS;
    } catch (err) {
      return DEFAULT_BULLETINS;
    }
  }

  // 2. Monta o texto de rolagem e renderiza na tela
  function renderLedMarquee() {
    const track1 = document.getElementById("led-marquee-track-1");
    const track2 = document.getElementById("led-marquee-track-2");
    const container = document.getElementById("led-marquee-board");
    const badge = document.getElementById("led-status-tag");

    if (!track1 || !track2 || !container) return;

    if (!bulletins || bulletins.length === 0) {
      bulletins = DEFAULT_BULLETINS;
    }

    // Define cor predominante ou da primeira mensagem prioritária
    const primaryItem = bulletins[0] || {};
    if (primaryItem.cor_led) {
      setLedColor(primaryItem.cor_led);
    }

    if (badge && primaryItem.autor) {
      badge.textContent = `RECADO: ${primaryItem.autor.toUpperCase()}`;
    }

    // Constrói HTML do texto com separadores temáticos de LED
    const htmlSnippets = bulletins.map((b) => {
      const icon = b.tipo === "show" ? "⚡" : b.tipo === "promocao" ? "📢" : b.tipo === "urgente" ? "🚨" : "💀";
      const author = b.autor ? `<span class="led-author-tag">[${formatLedText(b.autor)}]</span>` : "";
      return `
        <span class="led-message-item ${b.cor_led ? "led-color-" + b.cor_led : ""}">
          <span class="led-sep">${icon}</span>
          ${author}
          <span class="led-text-content">${formatLedText(b.mensagem)}</span>
        </span>
      `;
    });

    const fullHtml = htmlSnippets.join('<span class="led-dot-sep"> ••• </span>');

    track1.innerHTML = fullHtml;
    track2.innerHTML = fullHtml;

    // Calcula velocidade dinâmica baseada na largura total do texto (aprox. 75px por segundo para leitura suave)
    setTimeout(() => {
      const width = track1.scrollWidth || 1200;
      const durationSeconds = Math.max(18, Math.round(width / 70));
      track1.style.animationDuration = `${durationSeconds}s`;
      track2.style.animationDuration = `${durationSeconds}s`;
    }, 50);
  }

  // 3. Troca de cor do LED (Vermelho clássico, Âmbar metrô, Verde retro, Ciano neon)
  function setLedColor(color) {
    currentColorMode = color;
    const board = document.getElementById("led-marquee-board");
    if (!board) return;

    board.classList.remove("led-theme-red", "led-theme-amber", "led-theme-green", "led-theme-cyan");
    board.classList.add(`led-theme-${color}`);

    // Atualiza botões seletores se existirem
    document.querySelectorAll(".led-color-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.color === color);
    });
  }

  // 4. Conexão Realtime do Supabase (WebSocket nativo / Polling inteligente)
  function setupSupabaseRealtime() {
    const supabaseUrl = (CFG.SUPABASE_URL || "").trim().replace(/\/+$/, "");
    const supabaseKey = (CFG.SUPABASE_ANON_KEY || "").trim();
    const tableName = (CFG.SUPABASE_TABLE_LED || "letreiro_led").trim();

    if (!supabaseUrl || !supabaseKey) return;

    // Polling contínuo leve a cada 20 segundos
    setInterval(async () => {
      if (isFetching) return;
      isFetching = true;
      try {
        const fresh = await fetchBulletinsFromSupabase();
        const currentSig = JSON.stringify(bulletins.map((b) => b.id + b.mensagem + b.ativo + b.cor_led));
        const freshSig = JSON.stringify(fresh.map((b) => b.id + b.mensagem + b.ativo + b.cor_led));
        if (currentSig !== freshSig) {
          bulletins = fresh;
          renderLedMarquee();
          triggerLedFlash();
        }
      } catch (_) {
      } finally {
        isFetching = false;
      }
    }, 20000);

    // Tenta Realtime WebSocket Supabase v1
    try {
      const wsUrl = supabaseUrl.replace(/^https?:\/\//, "wss://") + `/realtime/v1/websocket?apikey=${supabaseKey}&vsn=1.0.0`;
      realtimeWs = new WebSocket(wsUrl);

      realtimeWs.onopen = () => {
        // Envia heartbeat e subscribe no canal
        const subMsg = {
          topic: `realtime:public:${tableName}`,
          event: "phx_join",
          payload: {},
          ref: "led_sub_1",
        };
        realtimeWs.send(JSON.stringify(subMsg));

        // Heartbeat periódico a cada 25s
        setInterval(() => {
          if (realtimeWs && realtimeWs.readyState === WebSocket.OPEN) {
            realtimeWs.send(JSON.stringify({ topic: "phoenix", event: "heartbeat", payload: {}, ref: "hb" }));
          }
        }, 25000);
      };

      realtimeWs.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.event === "INSERT" || msg.event === "UPDATE" || msg.event === "DELETE" || msg.event === "broadcast") {
            const fresh = await fetchBulletinsFromSupabase();
            bulletins = fresh;
            renderLedMarquee();
            triggerLedFlash();
          }
        } catch (_) {}
      };

      realtimeWs.onerror = () => {};
    } catch (_) {}
  }

  // Efeito de flash/glitch sutil no painel quando um novo aviso entra no ar
  function triggerLedFlash() {
    const board = document.getElementById("led-marquee-board");
    if (!board) return;
    board.classList.add("led-updating");
    setTimeout(() => {
      board.classList.remove("led-updating");
    }, 800);
  }

  // 5. Configuração de eventos de interação (Pause no hover, seletores de cor)
  function setupLedControls() {
    const board = document.getElementById("led-marquee-board");
    if (board) {
      // Pausar animação no hover / clique para leitura facilitada
      board.addEventListener("mouseenter", () => {
        board.classList.add("paused");
      });
      board.addEventListener("mouseleave", () => {
        board.classList.remove("paused");
      });
      board.addEventListener("touchstart", () => {
        board.classList.toggle("paused");
      }, { passive: true });
    }

    // Botões seletores de cor do LED
    document.querySelectorAll(".led-color-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const color = btn.dataset.color;
        if (color) setLedColor(color);
      });
    });
  }

  // 6. Inicialização do módulo
  async function init() {
    setupLedControls();
    bulletins = await fetchBulletinsFromSupabase();
    renderLedMarquee();
    setupSupabaseRealtime();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
