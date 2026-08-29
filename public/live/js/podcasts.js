/* ============================================================
   Caveira Mix — Módulo de Podcasts (Caveira Cast)
   Integração com Supabase + Player Dedicado + Adição de Episódios
   ============================================================ */
(function () {
  const CFG = window.CAVEIRA_CONFIG || {};
  let currentPodcastAudio = new Audio();
  let activePodcastId = null;
  let isPodcastPlaying = false;
  let podcastList = [];

  // Elementos do DOM
  const listContainer = document.getElementById("podcast-list-container");
  const playerBar = document.getElementById("podcast-player-bar");
  const playerCover = document.getElementById("podcast-player-cover");
  const playerTitle = document.getElementById("podcast-player-title");
  const playerHost = document.getElementById("podcast-player-host");
  const btnPlayPause = document.getElementById("podcast-player-play-btn");
  const progressFill = document.getElementById("podcast-progress-fill");
  const progressBar = document.getElementById("podcast-progress-bar");
  const timeDisplay = document.getElementById("podcast-player-time");
  const volumeSlider = document.getElementById("podcast-volume");
  const speedBtn = document.getElementById("podcast-speed-btn");

  // Elementos do Modal de Adicionar Podcast
  const modalAdd = document.getElementById("modal-add-podcast");
  const btnOpenModal = document.getElementById("btn-open-add-podcast");
  const btnCloseModal = document.getElementById("btn-close-add-podcast");
  const formAdd = document.getElementById("form-add-podcast");
  const addMsg = document.getElementById("add-podcast-msg");

  const speeds = [1, 1.25, 1.5, 2];
  let currentSpeedIndex = 0;

  function formatTime(seconds) {
    if (isNaN(seconds) || seconds === Infinity) return "00:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
  }

  /* ============================================================
     1. BUSCA DE PODCASTS NO SUPABASE
     ============================================================ */
  async function fetchPodcasts() {
    const supabaseUrl = (CFG.SUPABASE_URL || "").trim().replace(/\/+$/, "");
    const supabaseKey = (CFG.SUPABASE_ANON_KEY || "").trim();

    if (!supabaseUrl || !supabaseKey) {
      renderFallbackPodcasts();
      return;
    }

    try {
      const endpoint = `${supabaseUrl}/rest/v1/${CFG.SUPABASE_TABLE_PODCASTS || "podcasts"}?select=*&order=episodio_numero.desc,created_at.desc`;
      const res = await fetch(endpoint, {
        method: "GET",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) throw new Error("Erro ao buscar podcasts");
      const data = await res.json();

      if (Array.isArray(data) && data.length > 0) {
        podcastList = data;
        renderPodcasts(podcastList);
      } else {
        renderFallbackPodcasts();
      }
    } catch (err) {
      console.warn("[CaveiraCast] Fallback de podcasts ativado:", err.message);
      renderFallbackPodcasts();
    }
  }

  function renderFallbackPodcasts() {
    podcastList = [
      {
        id: "pod-01",
        titulo: "Caveira Cast #01 — A História Secreta do Heavy Metal Brasileiro",
        descricao: "Mergulhamos nas origens do Rock e Metal no Brasil, as primeiras bandas underground e fitas cassete trocadas por correio.",
        audio_url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
        capa_url: "/live/assets/logo.png",
        duracao: "38:45",
        episodio_numero: 1,
        host: "Beto Caveira & Convidados",
        destaque: true,
      },
      {
        id: "pod-02",
        titulo: "Caveira Cast #02 — Os Bastidores dos Maiores Festivais de Metal",
        descricao: "Histórias insanas de camarim, perrengues de estrada e os solos de guitarra mais icônicos de todos os tempos.",
        audio_url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
        capa_url: "/live/assets/logo.png",
        duracao: "45:20",
        episodio_numero: 2,
        host: "Beto Caveira",
        destaque: false,
      },
      {
        id: "pod-03",
        titulo: "Caveira Cast #03 — Bandas Underground Que Você Precisa Conhecer",
        descricao: "Uma seleção explosiva de novos lançamentos e bandas independentes do cenário Rock & Metal que estão botando fogo na cena.",
        audio_url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
        capa_url: "/live/assets/logo.png",
        duracao: "31:10",
        episodio_numero: 3,
        host: "Equipe Caveira Mix",
        destaque: false,
      },
    ];
    renderPodcasts(podcastList);
  }

  /* ============================================================
     2. RENDERIZAÇÃO DA GRADE DE EPISÓDIOS
     ============================================================ */
  function renderPodcasts(items) {
    const totalCountBadge = document.getElementById("total-episodes-count");
    if (totalCountBadge) {
      totalCountBadge.textContent = podcastList.length;
    }

    if (!listContainer) return;
    listContainer.innerHTML = "";

    items.forEach((pod) => {
      const isPlayingThis = activePodcastId === pod.id && isPodcastPlaying;
      const card = document.createElement("div");
      card.className = `podcast-card glass ${pod.destaque ? "podcast-card-featured" : ""} ${activePodcastId === pod.id ? "podcast-card-active" : ""}`;
      card.id = `podcast-item-${pod.id}`;

      card.innerHTML = `
        <div class="podcast-cover-wrap">
          <img class="podcast-cover-img" src="${pod.capa_url || "/live/assets/logo.png"}" alt="${pod.titulo}" onerror="this.src='/live/assets/logo.png'" />
          <button class="podcast-play-overlay-btn" data-pod-id="${pod.id}" aria-label="Tocar episódio">
            <span class="play-icon">${isPlayingThis ? "⏸" : "▶"}</span>
          </button>
          ${pod.destaque ? '<span class="podcast-featured-badge">🔥 DESTAQUE</span>' : ""}
          <span class="podcast-ep-badge">EP #${pod.episodio_numero || "00"}</span>
        </div>
        <div class="podcast-details">
          <div class="podcast-meta-row">
            <span class="podcast-host">🎙️ ${pod.host || "Caveira Mix"}</span>
            <span class="podcast-duration">⏱️ ${pod.duracao || "--:--"}</span>
          </div>
          <h4 class="podcast-title">${pod.titulo}</h4>
          <p class="podcast-desc">${pod.descricao || "Ouça agora o episódio completo na Caveira Mix."}</p>
          <div class="podcast-actions-row">
            <button class="btn-play-episode ${isPlayingThis ? "is-playing" : ""}" data-pod-id="${pod.id}">
              <span>${isPlayingThis ? "Pausar Episódio" : "Ouvir Episódio 🤘"}</span>
            </button>
            <a class="btn-share-episode" href="${pod.audio_url}" target="_blank" download title="Baixar / Abrir áudio">
              📥
            </a>
          </div>
        </div>
      `;

      listContainer.appendChild(card);
    });

    // Eventos de play nos botões
    const playBtns = listContainer.querySelectorAll("[data-pod-id]");
    playBtns.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const id = btn.getAttribute("data-pod-id");
        togglePodcast(id);
      });
    });
  }

  /* ============================================================
     3. CONTROLE DO PLAYER DE PODCAST
     ============================================================ */
  function togglePodcast(id) {
    const pod = podcastList.find((p) => p.id === id);
    if (!pod) return;

    // Se já é o mesmo podcast tocando
    if (activePodcastId === id) {
      if (isPodcastPlaying) {
        currentPodcastAudio.pause();
        isPodcastPlaying = false;
      } else {
        // Pausa a rádio ao vivo para não tocar junto
        pauseLiveRadio();
        currentPodcastAudio.play().catch(() => {});
        isPodcastPlaying = true;
      }
      updatePlayerUI(pod);
      renderPodcasts(podcastList);
      return;
    }

    // Novo podcast selecionado
    activePodcastId = id;
    currentPodcastAudio.pause();
    currentPodcastAudio.src = pod.audio_url;
    currentPodcastAudio.load();

    // Pausa a rádio ao vivo
    pauseLiveRadio();

    currentPodcastAudio.play().then(() => {
      isPodcastPlaying = true;
      updatePlayerUI(pod);
      renderPodcasts(podcastList);
    }).catch((err) => {
      console.warn("Erro ao reproduzir podcast:", err);
    });

    if (playerBar) {
      playerBar.classList.add("visible");
      playerBar.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  function pauseLiveRadio() {
    const liveAudio = document.getElementById("audio");
    if (liveAudio && !liveAudio.paused) {
      liveAudio.pause();
      const btnLivePlay = document.getElementById("btn-play");
      if (btnLivePlay) btnLivePlay.textContent = "▶";
      const disc = document.getElementById("disc");
      if (disc) disc.classList.remove("playing");
      const eq = document.getElementById("equalizer");
      if (eq) eq.classList.remove("active");
    }
  }

  function updatePlayerUI(pod) {
    if (!pod) return;
    if (playerTitle) playerTitle.textContent = pod.titulo;
    if (playerHost) playerHost.textContent = `🎙️ ${pod.host || "Caveira Mix"} • EP #${pod.episodio_numero || ""}`;
    if (playerCover) playerCover.src = pod.capa_url || "/live/assets/logo.png";
    if (btnPlayPause) btnPlayPause.textContent = isPodcastPlaying ? "⏸" : "▶";

    const epTag = document.getElementById("pod-player-ep-tag");
    if (epTag) epTag.textContent = `EP #${pod.episodio_numero || "00"}`;

    const statusTag = document.getElementById("pod-playing-status-tag");
    if (statusTag) statusTag.textContent = isPodcastPlaying ? "TOCANDO AGORA 🔊" : "PAUSADO";
  }

  // Busca em tempo real de episódios
  const searchInput = document.getElementById("podcast-search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const q = e.target.value.toLowerCase().trim();
      if (!q) {
        renderPodcasts(podcastList);
        return;
      }
      const filtered = podcastList.filter(
        (p) =>
          (p.titulo || "").toLowerCase().includes(q) ||
          (p.descricao || "").toLowerCase().includes(q) ||
          (p.host || "").toLowerCase().includes(q)
      );
      renderPodcasts(filtered);
    });
  }

  /* ============================================================
     4. EVENTOS DE ÁUDIO (TIMEUPDATE, SEEK, VOLUME, VELOCIDADE)
     ============================================================ */
  currentPodcastAudio.addEventListener("timeupdate", () => {
    const cur = currentPodcastAudio.currentTime;
    const dur = currentPodcastAudio.duration || 0;
    if (dur > 0) {
      const pct = (cur / dur) * 100;
      if (progressFill) progressFill.style.width = `${pct}%`;
      if (timeDisplay) timeDisplay.textContent = `${formatTime(cur)} / ${formatTime(dur)}`;
    }
  });

  currentPodcastAudio.addEventListener("ended", () => {
    isPodcastPlaying = false;
    if (btnPlayPause) btnPlayPause.textContent = "▶";
    renderPodcasts(podcastList);
  });

  if (btnPlayPause) {
    btnPlayPause.addEventListener("click", () => {
      if (!activePodcastId && podcastList.length > 0) {
        togglePodcast(podcastList[0].id);
        return;
      }
      togglePodcast(activePodcastId);
    });
  }

  if (progressBar) {
    progressBar.addEventListener("click", (e) => {
      const rect = progressBar.getBoundingClientRect();
      const pos = (e.clientX - rect.left) / rect.width;
      if (currentPodcastAudio.duration) {
        currentPodcastAudio.currentTime = pos * currentPodcastAudio.duration;
      }
    });
  }

  if (volumeSlider) {
    volumeSlider.addEventListener("input", () => {
      currentPodcastAudio.volume = volumeSlider.value / 100;
    });
    currentPodcastAudio.volume = volumeSlider.value / 100;
  }

  if (speedBtn) {
    speedBtn.addEventListener("click", () => {
      currentSpeedIndex = (currentSpeedIndex + 1) % speeds.length;
      const spd = speeds[currentSpeedIndex];
      currentPodcastAudio.playbackRate = spd;
      speedBtn.textContent = `${spd}x`;
    });
  }

  /* ============================================================
     5. MODAL DE ADICIONAR NOVO PODCAST (SUPABASE INSERT)
     ============================================================ */
  if (btnOpenModal && modalAdd) {
    btnOpenModal.addEventListener("click", () => {
      modalAdd.classList.add("active");
      if (addMsg) addMsg.textContent = "";
    });
  }

  if (btnCloseModal && modalAdd) {
    btnCloseModal.addEventListener("click", () => {
      modalAdd.classList.remove("active");
    });
  }

  if (modalAdd) {
    modalAdd.addEventListener("click", (e) => {
      if (e.target === modalAdd) modalAdd.classList.remove("active");
    });
  }

  if (formAdd) {
    formAdd.addEventListener("submit", async (e) => {
      e.preventDefault();
      const titulo = document.getElementById("add-pod-titulo").value.trim();
      const host = document.getElementById("add-pod-host").value.trim() || "Caveira Mix";
      const epNum = parseInt(document.getElementById("add-pod-ep").value) || 1;
      const audioUrl = document.getElementById("add-pod-audio").value.trim();
      const capaUrl = document.getElementById("add-pod-capa").value.trim() || "/live/assets/logo.png";
      const duracao = document.getElementById("add-pod-duracao").value.trim() || "30:00";
      const descricao = document.getElementById("add-pod-desc").value.trim();
      const destaque = document.getElementById("add-pod-destaque").checked;

      if (!titulo || !audioUrl) {
        if (addMsg) addMsg.textContent = "Título e URL do Áudio são obrigatórios.";
        return;
      }

      const supabaseUrl = (CFG.SUPABASE_URL || "").trim().replace(/\/+$/, "");
      const supabaseKey = (CFG.SUPABASE_ANON_KEY || "").trim();

      if (!supabaseUrl || !supabaseKey) {
        if (addMsg) addMsg.textContent = "Erro: Configuração do Supabase ausente.";
        return;
      }

      if (addMsg) {
        addMsg.style.color = "#00ffff";
        addMsg.textContent = "Enviando episódio para o Caveira Cast...";
      }

      try {
        const endpoint = `${supabaseUrl}/rest/v1/${CFG.SUPABASE_TABLE_PODCASTS || "podcasts"}`;
        const payload = {
          titulo,
          host,
          episodio_numero: epNum,
          audio_url: audioUrl,
          capa_url: capaUrl,
          duracao,
          descricao,
          destaque,
        };

        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errBody = await res.text();
          throw new Error(errBody || "Erro ao salvar no banco");
        }

        if (addMsg) {
          addMsg.style.color = "#00ff88";
          addMsg.textContent = "🤘 Episódio publicado com sucesso!";
        }

        formAdd.reset();
        setTimeout(() => {
          if (modalAdd) modalAdd.classList.remove("active");
          fetchPodcasts();
        }, 1200);
      } catch (err) {
        if (addMsg) {
          addMsg.style.color = "#ff2d3f";
          addMsg.textContent = `Erro ao salvar: ${err.message}`;
        }
      }
    });
  }

  // Inicialização
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fetchPodcasts);
  } else {
    fetchPodcasts();
  }
})();
