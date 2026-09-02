/* ============================================================
   Caveira Mix — Equalizador de 7 Bandas & Amplificador de Volume
   Processamento de Áudio em Tempo Real via Web Audio API
   ============================================================ */

(function () {
  // Bandas de Frequência do Equalizador
  const EQ_BANDS = [
    { id: "band-60", freq: 60, type: "lowshelf", label: "60Hz", name: "Sub" },
    { id: "band-170", freq: 170, type: "peaking", label: "170Hz", name: "Bass" },
    { id: "band-500", freq: 500, type: "peaking", label: "500Hz", name: "L-Mid" },
    { id: "band-1k", freq: 1000, type: "peaking", label: "1kHz", name: "Mid" },
    { id: "band-3k", freq: 3000, type: "peaking", label: "3kHz", name: "H-Mid" },
    { id: "band-6k", freq: 6000, type: "peaking", label: "6kHz", name: "Treble" },
    { id: "band-12k", freq: 12000, type: "highshelf", label: "12kHz", name: "Air" },
  ];

  // 8 Presets de Fábrica (Valores em dB de -12dB a +12dB)
  const PRESETS = {
    metal: {
      name: "🤘 Heavy Metal",
      gains: [7, 4, -3, 0, 5, 7, 8],
      boost: 1.25,
    },
    rock: {
      name: "🎸 Classic Rock",
      gains: [5, 3, 2, 3, 4, 5, 4],
      boost: 1.15,
    },
    thrash: {
      name: "⚡ Thrash Metal",
      gains: [8, 5, -5, -2, 6, 8, 9],
      boost: 1.3,
    },
    bass: {
      name: "🔊 Super Bass",
      gains: [10, 8, 4, 1, 0, 1, 2],
      boost: 1.2,
    },
    vocal: {
      name: "🎤 Vocal & Solos",
      gains: [-2, -1, 3, 6, 5, 3, 2],
      boost: 1.1,
    },
    underground: {
      name: "💀 Underground",
      gains: [9, 6, 1, 2, 4, 7, 8],
      boost: 1.25,
    },
    vintage: {
      name: "📻 Vintage Radio",
      gains: [-8, -4, 4, 7, 3, -6, -10],
      boost: 1.0,
    },
    flat: {
      name: "🎚️ Flat (Padrão)",
      gains: [0, 0, 0, 0, 0, 0, 0],
      boost: 1.0,
    },
  };

  // Estado do Equalizador
  let audioCtx = null;
  let audioSource = null;
  let filters = [];
  let boostGainNode = null;
  let limiterNode = null;
  let analyserNode = null;
  let isInitialized = false;
  let isEnabled = true;
  let currentPreset = "metal";
  let currentBoost = 1.2;
  let currentGains = [7, 4, -3, 0, 5, 7, 8];
  let vuDataArray = null;
  let vuAnimId = null;

  // Carrega preferências salvas
  try {
    const saved = localStorage.getItem("caveira_eq_config");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.gains && parsed.gains.length === 7) currentGains = parsed.gains;
      if (typeof parsed.boost === "number") currentBoost = parsed.boost;
      if (parsed.preset) currentPreset = parsed.preset;
      if (typeof parsed.enabled === "boolean") isEnabled = parsed.enabled;
    }
  } catch (e) {
    console.warn("[EQ] Falha ao carregar config salva:", e);
  }

  // 1. Inicializa o grafo Web Audio API
  function initAudioGraph(audioElement, externalAudioCtx) {
    if (isInitialized) {
      if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
      return { audioCtx, analyser: analyserNode };
    }

    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = externalAudioCtx || new AC();

      // Cria nó fonte a partir do elemento <audio>
      audioSource = audioCtx.createMediaElementSource(audioElement);

      // Cria os 7 filtros BiquadFilterNode
      filters = EQ_BANDS.map((band, idx) => {
        const filter = audioCtx.createBiquadFilter();
        filter.type = band.type;
        filter.frequency.value = band.freq;
        filter.gain.value = isEnabled ? currentGains[idx] : 0;
        if (band.type === "peaking") {
          filter.Q.value = 1.1; // Largura de banda natural
        }
        return filter;
      });

      // Cria nó amplificador de volume (Pre-Amp Booster: 1.0x a 2.5x)
      boostGainNode = audioCtx.createGain();
      boostGainNode.gain.value = isEnabled ? currentBoost : 1.0;

      // Cria limitador de segurança (DynamicsCompressorNode) para evitar clipping digital estridente
      limiterNode = audioCtx.createDynamicsCompressor();
      limiterNode.threshold.value = -1.5; // Limita em -1.5 dB
      limiterNode.knee.value = 6;
      limiterNode.ratio.value = 16;
      limiterNode.attack.value = 0.003; // 3ms rápido
      limiterNode.release.value = 0.25;

      // Cria analisador para o VU meter e visualizador
      analyserNode = audioCtx.createAnalyser();
      analyserNode.fftSize = 256;
      analyserNode.smoothingTimeConstant = 0.8;
      vuDataArray = new Uint8Array(analyserNode.frequencyBinCount);

      // Conecta a cadeia de áudio em série:
      // audioSource -> Filter1 -> Filter2 -> ... -> Filter7 -> boostGain -> limiter -> analyser -> destination
      let prevNode = audioSource;
      filters.forEach((filter) => {
        prevNode.connect(filter);
        prevNode = filter;
      });

      prevNode.connect(boostGainNode);
      boostGainNode.connect(limiterNode);
      limiterNode.connect(analyserNode);
      analyserNode.connect(audioCtx.destination);

      isInitialized = true;
      startVuMeterAnimation();

      return { audioCtx, analyser: analyserNode };
    } catch (err) {
      console.warn("[EQ] Web Audio API fallback:", err);
      isInitialized = "fallback";
      return null;
    }
  }

  // 2. Aplicação de Ganho em uma Banda específica
  function setBandGain(index, value) {
    const val = Math.max(-12, Math.min(12, parseFloat(value) || 0));
    currentGains[index] = val;

    if (filters[index] && audioCtx) {
      filters[index].gain.setTargetAtTime(isEnabled ? val : 0, audioCtx.currentTime, 0.02);
    }

    // Atualiza texto indicador no DOM
    const valEl = document.getElementById(`eq-val-${index}`);
    if (valEl) {
      valEl.textContent = `${val > 0 ? "+" : ""}${val}dB`;
    }

    // Marca preset como "Custom" caso desvie do pré-definido
    updatePresetSelectorIfCustom();
    saveConfig();
  }

  // 3. Aplicação do Amplificador de Volume (Booster)
  function setVolumeBoost(value) {
    const val = Math.max(1.0, Math.min(2.5, parseFloat(value) || 1.0));
    currentBoost = val;

    if (boostGainNode && audioCtx) {
      boostGainNode.gain.setTargetAtTime(isEnabled ? val : 1.0, audioCtx.currentTime, 0.02);
    }

    const boostValEl = document.getElementById("eq-boost-val");
    if (boostValEl) {
      const pct = Math.round(val * 100);
      boostValEl.textContent = `${pct}%`;
      if (pct > 150) {
        boostValEl.classList.add("high-boost");
      } else {
        boostValEl.classList.remove("high-boost");
      }
    }

    saveConfig();
  }

  // 4. Aplicação de Preset
  function applyPreset(presetKey) {
    const preset = PRESETS[presetKey];
    if (!preset) return;

    currentPreset = presetKey;
    currentGains = [...preset.gains];
    currentBoost = preset.boost || 1.0;

    // Atualiza filtros no áudio
    filters.forEach((filter, idx) => {
      if (filter && audioCtx) {
        filter.gain.setTargetAtTime(isEnabled ? currentGains[idx] : 0, audioCtx.currentTime, 0.03);
      }
    });

    if (boostGainNode && audioCtx) {
      boostGainNode.gain.setTargetAtTime(isEnabled ? currentBoost : 1.0, audioCtx.currentTime, 0.03);
    }

    // Atualiza sliders no DOM
    updateUIFromState();
    saveConfig();
  }

  // 5. Liga / Desliga (Bypass) do Equalizador
  function toggleEqualizer(forceState) {
    isEnabled = typeof forceState === "boolean" ? forceState : !isEnabled;

    filters.forEach((filter, idx) => {
      if (filter && audioCtx) {
        filter.gain.setTargetAtTime(isEnabled ? currentGains[idx] : 0, audioCtx.currentTime, 0.03);
      }
    });

    if (boostGainNode && audioCtx) {
      boostGainNode.gain.setTargetAtTime(isEnabled ? currentBoost : 1.0, audioCtx.currentTime, 0.03);
    }

    const toggleBtn = document.getElementById("eq-btn-power");
    const card = document.getElementById("equalizer-card");
    if (toggleBtn) {
      toggleBtn.classList.toggle("active", isEnabled);
      toggleBtn.setAttribute("aria-checked", isEnabled ? "true" : "false");
    }
    if (card) {
      card.classList.toggle("eq-bypassed", !isEnabled);
    }

    saveConfig();
  }

  // 6. Reset para Flat
  function resetEqualizer() {
    applyPreset("flat");
  }

  // 7. Salva no LocalStorage
  function saveConfig() {
    try {
      localStorage.setItem(
        "caveira_eq_config",
        JSON.stringify({
          gains: currentGains,
          boost: currentBoost,
          preset: currentPreset,
          enabled: isEnabled,
        })
      );
    } catch (e) {}
  }

  // 8. Atualiza controles de UI a partir do estado interno
  function updateUIFromState() {
    // Sliders de banda
    EQ_BANDS.forEach((band, idx) => {
      const slider = document.getElementById(`eq-slider-${idx}`);
      const valEl = document.getElementById(`eq-val-${idx}`);
      const gain = currentGains[idx] || 0;

      if (slider) slider.value = gain;
      if (valEl) valEl.textContent = `${gain > 0 ? "+" : ""}${gain}dB`;
    });

    // Slider de Boost
    const boostSlider = document.getElementById("eq-slider-boost");
    const boostValEl = document.getElementById("eq-boost-val");
    if (boostSlider) boostSlider.value = currentBoost;
    if (boostValEl) {
      const pct = Math.round(currentBoost * 100);
      boostValEl.textContent = `${pct}%`;
      if (pct > 150) boostValEl.classList.add("high-boost");
      else boostValEl.classList.remove("high-boost");
    }

    // Select de Preset
    const select = document.getElementById("eq-preset-select");
    if (select) select.value = currentPreset;

    // Botão Power
    const toggleBtn = document.getElementById("eq-btn-power");
    const card = document.getElementById("equalizer-card");
    if (toggleBtn) {
      toggleBtn.classList.toggle("active", isEnabled);
    }
    if (card) {
      card.classList.toggle("eq-bypassed", !isEnabled);
    }
  }

  function updatePresetSelectorIfCustom() {
    const select = document.getElementById("eq-preset-select");
    if (!select) return;

    // Checa se coincide com algum preset
    let match = null;
    for (const [key, p] of Object.entries(PRESETS)) {
      const sameGains = p.gains.every((g, i) => g === currentGains[i]);
      if (sameGains) {
        match = key;
        break;
      }
    }

    currentPreset = match || "custom";
    select.value = currentPreset;
  }

  // 9. Animação dos Medidores VU Stereo em Tempo Real
  function startVuMeterAnimation() {
    if (vuAnimId) cancelAnimationFrame(vuAnimId);

    const vuLeftSegments = document.querySelectorAll(".vu-meter-left .vu-segment");
    const vuRightSegments = document.querySelectorAll(".vu-meter-right .vu-segment");

    function renderVu() {
      if (analyserNode && vuDataArray && isEnabled) {
        analyserNode.getByteFrequencyData(vuDataArray);

        // Calcula energia dos graves e agudos para simular canais estéreo L/R
        let sumL = 0, sumR = 0;
        const half = Math.floor(vuDataArray.length / 2);

        for (let i = 0; i < half; i++) sumL += vuDataArray[i];
        for (let i = half; i < vuDataArray.length; i++) sumR += vuDataArray[i];

        const avgL = sumL / half;
        const avgR = sumR / (vuDataArray.length - half);

        // Nível de 0 a 8 LEDs acesos
        const levelL = Math.min(8, Math.floor((avgL / 180) * 8 * (currentBoost * 0.8)));
        const levelR = Math.min(8, Math.floor((avgR / 180) * 8 * (currentBoost * 0.8)));

        vuLeftSegments.forEach((seg, i) => {
          seg.classList.toggle("lit", i < levelL);
        });

        vuRightSegments.forEach((seg, i) => {
          seg.classList.toggle("lit", i < levelR);
        });
      } else {
        vuLeftSegments.forEach((seg) => seg.classList.remove("lit"));
        vuRightSegments.forEach((seg) => seg.classList.remove("lit"));
      }

      vuAnimId = requestAnimationFrame(renderVu);
    }

    renderVu();
  }

  // 10. Renderização da Interface do Equalizador
  function renderEqualizerHTML() {
    const container = document.getElementById("equalizer-container");
    if (!container) return;

    const bandsHtml = EQ_BANDS.map((band, idx) => {
      const val = currentGains[idx] || 0;
      return `
        <div class="eq-band-column" title="${band.name} (${band.freq}Hz)">
          <span class="eq-band-val" id="eq-val-${idx}">${val > 0 ? "+" : ""}${val}dB</span>
          <div class="eq-slider-track-wrap">
            <input
              type="range"
              class="eq-slider vertical-slider"
              id="eq-slider-${idx}"
              data-index="${idx}"
              min="-12"
              max="12"
              step="1"
              value="${val}"
              orient="vertical"
              aria-label="${band.name} ${band.label}"
            />
          </div>
          <span class="eq-band-freq">${band.label}</span>
          <span class="eq-band-name">${band.name}</span>
        </div>
      `;
    }).join("");

    const presetsOptions = Object.entries(PRESETS).map(([key, p]) => {
      return `<option value="${key}" ${key === currentPreset ? "selected" : ""}>${p.name}</option>`;
    }).join("") + `<option value="custom" ${currentPreset === "custom" ? "selected" : ""}>⚙️ Custom (Personalizado)</option>`;

    container.innerHTML = `
      <div class="equalizer-card glass" id="equalizer-card">
        <!-- Chassi Superior / Header de Rack -->
        <div class="eq-header">
          <div class="eq-screws">
            <span class="eq-screw"></span>
            <span class="eq-screw"></span>
          </div>
          <div class="eq-title-wrap">
            <span class="eq-status-dot"></span>
            <h3 class="eq-title">EQUALIZADOR & BOOSTER</h3>
            <span class="eq-code">RACK PRO // 7-BAND</span>
          </div>
          <div class="eq-header-controls">
            <button
              class="eq-btn-power ${isEnabled ? 'active' : ''}"
              id="eq-btn-power"
              title="Ligar / Desligar Equalizador (Bypass)"
              aria-label="Power EQ"
            >
              <span class="power-ico">⏻</span>
              <span class="power-txt">${isEnabled ? 'EQ ON' : 'BYPASS'}</span>
            </button>
          </div>
          <div class="eq-screws">
            <span class="eq-screw"></span>
            <span class="eq-screw"></span>
          </div>
        </div>

        <!-- Seletor de Presets & Medidor VU -->
        <div class="eq-controls-bar">
          <div class="eq-preset-wrap">
            <label for="eq-preset-select" class="eq-label">PRESET:</label>
            <select id="eq-preset-select" class="eq-preset-select" aria-label="Escolher Preset de Equalização">
              ${presetsOptions}
            </select>
          </div>

          <!-- VU Meter Stereo Digital -->
          <div class="eq-vu-meter" title="Medidor de Nível Stereo">
            <div class="vu-channel">
              <span class="vu-chan-label">L</span>
              <div class="vu-meter-bar vu-meter-left">
                <span class="vu-segment red"></span>
                <span class="vu-segment yellow"></span>
                <span class="vu-segment yellow"></span>
                <span class="vu-segment green"></span>
                <span class="vu-segment green"></span>
                <span class="vu-segment green"></span>
                <span class="vu-segment green"></span>
                <span class="vu-segment green"></span>
              </div>
            </div>
            <div class="vu-channel">
              <span class="vu-chan-label">R</span>
              <div class="vu-meter-bar vu-meter-right">
                <span class="vu-segment red"></span>
                <span class="vu-segment yellow"></span>
                <span class="vu-segment yellow"></span>
                <span class="vu-segment green"></span>
                <span class="vu-segment green"></span>
                <span class="vu-segment green"></span>
                <span class="vu-segment green"></span>
                <span class="vu-segment green"></span>
              </div>
            </div>
          </div>
        </div>

        <!-- Grade dos 7 Sliders Verticais de Frequência -->
        <div class="eq-bands-grid">
          ${bandsHtml}
        </div>

        <!-- Rodapé do Rack: Amplificador de Volume (Pre-Amp Gain Booster) & Reset -->
        <div class="eq-footer">
          <div class="eq-booster-wrap">
            <div class="eq-booster-label-row">
              <span class="booster-icon">⚡</span>
              <span class="booster-title">AMPLIFICADOR DE GANHO:</span>
              <span class="booster-val ${currentBoost > 1.5 ? 'high-boost' : ''}" id="eq-boost-val">${Math.round(currentBoost * 100)}%</span>
            </div>
            <input
              type="range"
              class="eq-slider booster-slider"
              id="eq-slider-boost"
              min="1.0"
              max="2.5"
              step="0.05"
              value="${currentBoost}"
              aria-label="Amplificador de Ganho"
              title="Aumente o volume além do limite padrão (100% até 250%)"
            />
          </div>

          <div class="eq-actions">
            <button type="button" class="btn-eq-reset" id="btn-eq-reset" title="Restaurar Equalizador para Flat (0dB)">
              <span>↺ Reset Flat</span>
            </button>
          </div>
        </div>
      </div>
    `;

    bindEvents();
  }

  // 11. Conexão de Eventos DOM
  function bindEvents() {
    // Sliders de banda
    EQ_BANDS.forEach((band, idx) => {
      const slider = document.getElementById(`eq-slider-${idx}`);
      if (slider) {
        slider.addEventListener("input", (e) => {
          setBandGain(idx, e.target.value);
        });
      }
    });

    // Slider de Booster
    const boostSlider = document.getElementById("eq-slider-boost");
    if (boostSlider) {
      boostSlider.addEventListener("input", (e) => {
        setVolumeBoost(e.target.value);
      });
    }

    // Select de Presets
    const select = document.getElementById("eq-preset-select");
    if (select) {
      select.addEventListener("change", (e) => {
        if (e.target.value !== "custom") {
          applyPreset(e.target.value);
        }
      });
    }

    // Botão Power / Bypass
    const toggleBtn = document.getElementById("eq-btn-power");
    if (toggleBtn) {
      toggleBtn.addEventListener("click", () => {
        toggleEqualizer();
      });
    }

    // Botão Reset
    const resetBtn = document.getElementById("btn-eq-reset");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        resetEqualizer();
      });
    }
  }

  // 12. Interface Pública
  window.CAVEIRA_EQ = {
    init: initAudioGraph,
    setBandGain,
    setVolumeBoost,
    applyPreset,
    toggleEqualizer,
    resetEqualizer,
    getAudioContext: () => audioCtx,
    getAnalyser: () => analyserNode,
    isReady: () => isInitialized === true,
  };

  // Inicialização do DOM
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderEqualizerHTML);
  } else {
    renderEqualizerHTML();
  }
})();
