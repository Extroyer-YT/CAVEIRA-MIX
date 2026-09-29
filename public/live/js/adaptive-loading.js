/**
 * Caveira Mix — Sistema de Adaptive Loading
 * Detecta CPU, memória aproximada, velocidade de conexão e bateria
 * para entregar automaticamente a melhor experiência (Potente, Médio, Fraco / Modo Lite).
 */
(function () {
  const STORAGE_KEY = "caveira_perf_profile";

  // Obter métricas do dispositivo e conexão
  function getHardwareMetrics() {
    const nav = navigator || {};
    const conn = nav.connection || nav.mozConnection || nav.webkitConnection || {};

    // 1. Núcleos de CPU (logical cores)
    const cores = typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : 4;

    // 2. Memória RAM aproximada em GiB (Chrome / Chromium / Android)
    const memory = typeof nav.deviceMemory === "number" ? nav.deviceMemory : null;

    // 3. Informações de Conexão de Rede (Network Information API)
    const effectiveType = conn.effectiveType || "4g"; // 'slow-2g', '2g', '3g', '4g'
    const saveData = Boolean(conn.saveData);
    const downlink = typeof conn.downlink === "number" ? conn.downlink : 10; // Mbps
    const rtt = typeof conn.rtt === "number" ? conn.rtt : 50; // ms

    // 4. Preferência de redução de movimento (Acessibilidade do SO)
    const prefersReducedMotion = window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

    return {
      cores,
      memory,
      effectiveType,
      saveData,
      downlink,
      rtt,
      prefersReducedMotion,
    };
  }

  // Avalia e calcula o perfil com base nas métricas
  function calculateProfile(metrics) {
    // Override do usuário salvo no localStorage
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && ["potente", "medio", "fraco"].includes(saved)) {
      return { profile: saved, isAuto: false };
    }

    const { cores, memory, effectiveType, saveData, prefersReducedMotion } = metrics;

    // ================== PERFIL FRACO (MODO LITE) ==================
    // Condições que ativam o Modo Lite automaticamente:
    // - Economia de dados ativada no navegador (Save-Data)
    // - Conexão lenta (2G ou slow-2g)
    // - Pouca memória (<= 2 GB)
    // - CPU limitada (<= 2 núcleos)
    // - Preferência de movimento reduzido ativada no sistema
    if (
      saveData ||
      effectiveType === "slow-2g" ||
      effectiveType === "2g" ||
      (memory !== null && memory <= 2) ||
      cores <= 2 ||
      prefersReducedMotion
    ) {
      return { profile: "fraco", isAuto: true };
    }

    // ================== PERFIL MÉDIO (EQUILIBRADO) ==================
    // Condições que ativam o Modo Médio:
    // - Conexão 3G
    // - Memória entre 3 e 4 GB
    // - CPU de 3 ou 4 núcleos
    if (
      effectiveType === "3g" ||
      (memory !== null && memory <= 4) ||
      cores <= 4
    ) {
      return { profile: "medio", isAuto: true };
    }

    // ================== PERFIL POTENTE (COMPLETO) ==================
    // Dispositivos modernos com CPU >= 6 núcleos, RAM >= 6 GB e rede 4G
    return { profile: "potente", isAuto: true };
  }

  let currentProfile = "potente";
  let isAutoMode = true;

  function applyProfile(profile, isAuto) {
    currentProfile = profile;
    isAutoMode = Boolean(isAuto);

    const root = document.documentElement;
    root.classList.remove("perf-potente", "perf-medio", "perf-fraco");
    root.classList.add("perf-" + profile);

    // Também sincroniza com body se já existir
    if (document.body) {
      document.body.classList.remove("perf-potente", "perf-medio", "perf-fraco");
      document.body.classList.add("perf-" + profile);
    }

    // Dispara evento customizado para os scripts reagirem em tempo real
    window.dispatchEvent(
      new CustomEvent("caveira:perf-changed", {
        detail: {
          profile,
          isAuto,
          metrics: getHardwareMetrics(),
        },
      })
    );

    // Atualiza botão/badge de status na UI se existir
    updateStatusBadge();
  }

  function setProfile(newProfile) {
    if (newProfile === "auto") {
      localStorage.removeItem(STORAGE_KEY);
      const res = calculateProfile(getHardwareMetrics());
      applyProfile(res.profile, true);
    } else if (["potente", "medio", "fraco"].includes(newProfile)) {
      localStorage.setItem(STORAGE_KEY, newProfile);
      applyProfile(newProfile, false);
    }
  }

  function updateStatusBadge() {
    const badge = document.getElementById("perf-mode-btn");
    const label = document.getElementById("perf-mode-label");
    if (!badge || !label) return;

    const names = {
      potente: "🚀 Potente",
      medio: "⚡ Médio",
      fraco: "🍃 Modo Lite",
    };

    label.textContent = (names[currentProfile] || currentProfile) + (isAutoMode ? " (Auto)" : "");
    badge.setAttribute("data-profile", currentProfile);
    badge.setAttribute(
      "title",
      `Perfil de desempenho atual: ${names[currentProfile]} ${isAutoMode ? "(Automático)" : "(Manual)"}. Clique para alterar.`
    );
  }

  // Executa detecção inicial imediatamente para evitar FOUC (flash de efeitos pesados)
  const initialMetrics = getHardwareMetrics();
  const initialResult = calculateProfile(initialMetrics);
  applyProfile(initialResult.profile, initialResult.isAuto);

  // Monitora mudanças dinâmicas na rede (ex: usuário entrou em rede fraca 2G)
  const nav = navigator || {};
  const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
  if (conn && typeof conn.addEventListener === "function") {
    conn.addEventListener("change", () => {
      // Apenas readapta automaticamente se o usuário não fixou manualmente
      if (!localStorage.getItem(STORAGE_KEY)) {
        const res = calculateProfile(getHardwareMetrics());
        applyProfile(res.profile, true);
      }
    });
  }

  // Inicializa a UI do seletor quando o DOM carregar
  document.addEventListener("DOMContentLoaded", () => {
    // Reaplica classe no body
    document.body.classList.add("perf-" + currentProfile);
    updateStatusBadge();
  });

  // Expõe API global
  window.CaveiraAdaptive = {
    getProfile: () => currentProfile,
    isAuto: () => isAutoMode,
    setProfile,
    getMetrics: getHardwareMetrics,
  };

  // ================== MONITORAMENTO DINÂMICO DE FPS ==================
  // Mede os quadros por segundo em tempo real e rebaixa ou reajusta o perfil
  // caso o dispositivo engasgue rodando as animações/scripts da página.
  (function initFpsMonitor() {
    let frameCount = 0;
    let lastTime = performance.now();
    let consecutiveLowFpsCount = 0;
    let consecutiveMediumFpsCount = 0;

    function checkFpsLoop(now) {
      frameCount++;
      const elapsed = now - lastTime;

      // Amostra a cada ~1.5 segundos para obter uma média estável de FPS
      if (elapsed >= 1500) {
        const fps = Math.round((frameCount * 1000) / elapsed);
        frameCount = 0;
        lastTime = now;

        // Só adapta se o usuário estiver em modo automático e a aba estiver visível
        if (!localStorage.getItem(STORAGE_KEY) && !document.hidden) {
          // Se o FPS cair abaixo de 28 persistentemente (aparelho travando ou engasgando)
          if (fps < 28) {
            consecutiveLowFpsCount++;
            consecutiveMediumFpsCount = 0;
            // 2 amostras seguidas com FPS baixo (~3 segundos seguidos)
            if (consecutiveLowFpsCount >= 2 && currentProfile !== "fraco") {
              applyProfile("fraco", true);
            }
          } else if (fps < 45) {
            // FPS mediano/oscilante (entre 28 e 45)
            consecutiveMediumFpsCount++;
            consecutiveLowFpsCount = 0;
            // Se estiver em 'potente' e não conseguir segurar 45+ fps, reduz para 'medio'
            if (consecutiveMediumFpsCount >= 3 && currentProfile === "potente") {
              applyProfile("medio", true);
            }
          } else {
            // FPS saudável (>= 45 fps)
            consecutiveLowFpsCount = 0;
            consecutiveMediumFpsCount = 0;
          }
        }
      }

      requestAnimationFrame(checkFpsLoop);
    }

    // Inicia o loop de medição
    requestAnimationFrame(checkFpsLoop);
  })();
})();
