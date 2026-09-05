/* ============================================================
   Caveira Mix — Módulo de Patrocinadores & Supabase
   Atualização dinâmica sem mexer no código do site
   ============================================================ */

(function () {
  const CFG = window.CAVEIRA_CONFIG || {};

  // Patrocinadores padrão (fallback visual caso o Supabase não esteja preenchido ainda)
  const DEFAULT_SPONSORS = [
    {
      id: "demo-1",
      nome: "Caveira Rock Store",
      descricao: "Camisetas oficiais, discos de vinil e acessórios do bom e velho Rock & Metal.",
      imagem_url: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80",
      link_url: "https://caveira-mix.uk/",
      categoria: "Patrocinador Master",
    },
    {
      id: "demo-2",
      nome: "Hellfire Custom Guitars",
      descricao: "Luthieria especializada, regulagens pesadas e instrumentos customizados.",
      imagem_url: "https://images.unsplash.com/photo-1525201548942-d8732f6617a0?w=600&auto=format&fit=crop&q=80",
      link_url: "https://caveira-mix.uk/",
      categoria: "Apoio Cultural",
    },
    {
      id: "demo-3",
      nome: "Underground Pub & Tattoo",
      descricao: "Cervejas artesanais, os melhores petiscos e flash tattoos exclusivas.",
      imagem_url: "https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=600&auto=format&fit=crop&q=80",
      link_url: "https://caveira-mix.uk/",
      categoria: "Parceiro Oficial",
    },
  ];

  let sponsorsList = [];
  let currentIndex = 0;
  let autoSlideTimer = null;
  let isHovered = false;

  // Busca do Supabase via REST API (leve, rápido e sem dependências pesadas)
  async function fetchSponsorsFromSupabase() {
    const supabaseUrl = (CFG.SUPABASE_URL || "").trim().replace(/\/+$/, "");
    const supabaseKey = (CFG.SUPABASE_ANON_KEY || "").trim();
    const tableName = (CFG.SUPABASE_TABLE_SPONSORS || "patrocinadores").trim();

    if (!supabaseUrl || !supabaseKey) {
      console.info("ℹ️ [Patrocinadores] Supabase não configurado em config.js. Exibindo patrocinadores modelo.");
      return DEFAULT_SPONSORS;
    }

    try {
      const endpoint = `${supabaseUrl}/rest/v1/${tableName}?select=*&ativo=eq.true&order=ordem.asc,created_at.desc`;
      const res = await fetch(endpoint, {
        method: "GET",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data;
      } else {
        console.warn("⚠️ [Patrocinadores] Tabela Supabase retornou 0 itens ativos. Exibindo padrão.");
        return DEFAULT_SPONSORS;
      }
    } catch (err) {
      console.error("❌ [Patrocinadores] Erro ao buscar do Supabase:", err);
      return DEFAULT_SPONSORS;
    }
  }

  function renderSponsorsUI(container) {
    if (!container) return;

    const contactUrl = CFG.SPONSOR_CONTACT_URL || "https://wa.me/?text=Olá!%20Gostaria%20de%20anunciar%20na%20Caveira%20Mix";

    container.innerHTML = `
      <aside class="sponsors-card glass" id="sponsors-widget" aria-label="Quadro de Patrocinadores">
        <div class="sponsors-header">
          <div class="sponsors-header-title">
            <span class="sponsors-fire-icon">🔥</span>
            <span class="sponsors-title-text">PATROCINADORES</span>
          </div>
          <div class="sponsors-controls">
            <button class="sponsor-nav-btn" id="sponsor-prev" type="button" aria-label="Patrocinador anterior">‹</button>
            <span class="sponsors-counter" id="sponsor-counter">1 / 1</span>
            <button class="sponsor-nav-btn" id="sponsor-next" type="button" aria-label="Próximo patrocinador">›</button>
          </div>
        </div>

        <div class="sponsors-slider-viewport" id="sponsors-viewport">
          <div class="sponsors-slider-track" id="sponsors-track">
            <!-- Cards gerados via JS -->
          </div>
        </div>

        <div class="sponsors-dots" id="sponsors-dots"></div>

        <div class="sponsors-footer">
          <a class="btn-anuncie-aqui" href="${contactUrl}" target="_blank" rel="noopener">
            <span class="anuncie-icon">⚡</span>
            <span class="anuncie-text">Anuncie na Rádio Caveira</span>
            <span class="anuncie-arrow">↗</span>
          </a>
        </div>
      </aside>
    `;

    // Listeners dos botões de controle
    const prevBtn = document.getElementById("sponsor-prev");
    const nextBtn = document.getElementById("sponsor-next");
    const viewport = document.getElementById("sponsors-viewport");

    if (prevBtn) {
      prevBtn.addEventListener("click", () => {
        prevSlide();
        resetTimer();
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener("click", () => {
        nextSlide();
        resetTimer();
      });
    }

    if (viewport) {
      viewport.addEventListener("mouseenter", () => { isHovered = true; });
      viewport.addEventListener("mouseleave", () => { isHovered = false; });
      viewport.addEventListener("touchstart", () => { isHovered = true; }, { passive: true });
      viewport.addEventListener("touchend", () => { isHovered = false; }, { passive: true });
    }
  }

  function updateSlideDisplay() {
    const track = document.getElementById("sponsors-track");
    const counter = document.getElementById("sponsor-counter");
    const dotsContainer = document.getElementById("sponsors-dots");

    if (!track || sponsorsList.length === 0) return;

    // Garante que o índice esteja nos limites
    if (currentIndex >= sponsorsList.length) currentIndex = 0;
    if (currentIndex < 0) currentIndex = sponsorsList.length - 1;

    // Atualiza o contador
    if (counter) {
      counter.textContent = `${currentIndex + 1} / ${sponsorsList.length}`;
    }

    // Translação do track
    track.style.transform = `translateX(-${currentIndex * 100}%)`;

    // Atualiza bolinhas (dots)
    if (dotsContainer) {
      const dots = dotsContainer.querySelectorAll(".sponsor-dot");
      dots.forEach((dot, idx) => {
        dot.classList.toggle("active", idx === currentIndex);
      });
    }
  }

  function renderSlides() {
    const track = document.getElementById("sponsors-track");
    const dotsContainer = document.getElementById("sponsors-dots");
    if (!track) return;

    track.innerHTML = "";
    if (dotsContainer) dotsContainer.innerHTML = "";

    sponsorsList.forEach((sp, idx) => {
      // Slide
      const slide = document.createElement("div");
      slide.className = "sponsor-slide";
      
      const link = sp.link_url && sp.link_url.trim() ? sp.link_url : "#";
      const hasValidLink = link !== "#";
      const targetAttr = hasValidLink ? 'target="_blank" rel="noopener"' : '';
      const categoria = sp.categoria || "Patrocinador Oficial";
      const desc = sp.descricao || "";

      slide.innerHTML = `
        <div class="sponsor-card-inner">
          <div class="sponsor-badge-wrap">
            <span class="sponsor-badge">${escapeHtml(categoria)}</span>
          </div>
          
          <a class="sponsor-media-link" href="${link}" ${targetAttr} aria-label="Visitar ${escapeHtml(sp.nome)}">
            <div class="sponsor-img-wrap">
              <img class="sponsor-img" src="${sp.imagem_url}" alt="${escapeHtml(sp.nome)}" loading="lazy" onerror="this.src='/live/assets/logo.png'" />
              <div class="sponsor-img-overlay">
                <span class="sponsor-visit-chip">Visitar ↗</span>
              </div>
            </div>
          </a>

          <div class="sponsor-info">
            <h3 class="sponsor-name">${escapeHtml(sp.nome)}</h3>
            ${desc ? `<p class="sponsor-desc">${escapeHtml(desc)}</p>` : ""}
            <a class="sponsor-action-btn" href="${link}" ${targetAttr}>
              <span>Acessar Parceiro</span>
              <svg class="sponsor-link-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
            </a>
          </div>
        </div>
      `;

      track.appendChild(slide);

      // Dot
      if (dotsContainer) {
        const dot = document.createElement("button");
        dot.className = `sponsor-dot ${idx === 0 ? "active" : ""}`;
        dot.type = "button";
        dot.setAttribute("aria-label", `Ir para patrocinador ${idx + 1}`);
        dot.addEventListener("click", () => {
          currentIndex = idx;
          updateSlideDisplay();
          resetTimer();
        });
        dotsContainer.appendChild(dot);
      }
    });

    updateSlideDisplay();
  }

  function nextSlide() {
    if (sponsorsList.length <= 1) return;
    currentIndex = (currentIndex + 1) % sponsorsList.length;
    updateSlideDisplay();
  }

  function prevSlide() {
    if (sponsorsList.length <= 1) return;
    currentIndex = (currentIndex - 1 + sponsorsList.length) % sponsorsList.length;
    updateSlideDisplay();
  }

  function startAutoSlide() {
    stopAutoSlide();
    autoSlideTimer = setInterval(() => {
      if (!isHovered && sponsorsList.length > 1) {
        nextSlide();
      }
    }, 6000); // Passa a cada 6 segundos
  }

  function stopAutoSlide() {
    if (autoSlideTimer) {
      clearInterval(autoSlideTimer);
      autoSlideTimer = null;
    }
  }

  function resetTimer() {
    stopAutoSlide();
    startAutoSlide();
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Inicialização
  async function init() {
    const container = document.getElementById("sponsors-container");
    if (!container) return;

    renderSponsorsUI(container);

    // Carrega dados (Supabase ou Fallback)
    sponsorsList = await fetchSponsorsFromSupabase();
    renderSlides();
    startAutoSlide();

    // Atualização em segundo plano a cada 5 minutos caso o Supabase seja alterado
    setInterval(async () => {
      const refreshed = await fetchSponsorsFromSupabase();
      if (JSON.stringify(refreshed) !== JSON.stringify(sponsorsList)) {
        sponsorsList = refreshed;
        renderSlides();
      }
    }, 5 * 60 * 1000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
