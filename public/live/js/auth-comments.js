/* ============================================================
   Caveira Mix — Mural de Comentários & Sistema de Autenticação
   Conectado ao Supabase com Realtime WebSockets
   ============================================================ */

(function () {
  const CFG = window.CAVEIRA_CONFIG || {};

  // Elementos do DOM
  let elCommentsList = null;
  let elCommentForm = null;
  let elCommentInput = null;
  let elCharCount = null;
  let elCommentsCount = null;
  let elAuthBtnHeader = null;
  let elUserBar = null;
  let elAuthModal = null;
  let elAuthFormLogin = null;
  let elAuthFormRegister = null;

  // Estado do Módulo
  let supabaseClient = null;
  let currentUser = null;
  let commentsData = [];
  let likedCommentIds = new Set();
  let realtimeChannel = null;
  let selectedAvatar = "💀";
  let selectedBadge = "🤘 Headbanger";

  // Carrega IDs curtidos do localStorage
  try {
    const savedLikes = localStorage.getItem("caveira_liked_comments");
    if (savedLikes) {
      likedCommentIds = new Set(JSON.parse(savedLikes));
    }
  } catch (e) {
    console.warn("[Mural] Falha ao ler likes salvos:", e);
  }

  // 1. Inicializa o cliente Supabase
  function initSupabase() {
    const url = (CFG.SUPABASE_URL || "").trim();
    const key = (CFG.SUPABASE_ANON_KEY || "").trim();

    if (!url || !key) {
      console.warn("[Mural] Supabase URL ou Anon Key não configuradas no config.js.");
      return null;
    }

    if (window.supabase && typeof window.supabase.createClient === "function") {
      try {
        supabaseClient = window.supabase.createClient(url, key, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
          },
        });
        return supabaseClient;
      } catch (err) {
        console.error("[Mural] Erro ao criar cliente Supabase:", err);
        return null;
      }
    } else {
      console.warn("[Mural] SDK do Supabase não carregado no window.supabase.");
      return null;
    }
  }

  // 2. Formatação de tempo relativo ("agora", "há 5 min", "há 2h")
  function timeAgo(dateString) {
    if (!dateString) return "agora";
    const now = new Date();
    const past = new Date(dateString);
    const diffSec = Math.floor((now - past) / 1000);

    if (diffSec < 10) return "agora mesmo";
    if (diffSec < 60) return `há ${diffSec}s`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `há ${diffMin} min`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `há ${diffHours}h`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return "ontem";
    if (diffDays < 30) return `há ${diffDays} dias`;
    return past.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  }

  // Sanitização de texto contra XSS
  function escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // 3. Exibição de Toast / Notificações visuais
  function showToast(msg, type = "info") {
    const existing = document.getElementById("caveira-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "caveira-toast";
    toast.className = `caveira-toast toast-${type}`;
    
    let icon = "🤘";
    if (type === "success") icon = "✅";
    if (type === "error") icon = "⚠️";

    toast.innerHTML = `<span class="toast-icon">${icon}</span> <span class="toast-msg">${escapeHtml(msg)}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add("show");
    }, 10);

    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 400);
    }, 4000);
  }
  window.showToast = showToast;

  // 4. Carrega a Sessão do Usuário
  async function checkAuthSession() {
    if (!supabaseClient) return;

    try {
      const { data: { session }, error } = await supabaseClient.auth.getSession();
      if (error) throw error;

      if (session && session.user) {
        currentUser = {
          id: session.user.id,
          email: session.user.email,
          name: session.user.user_metadata?.name || session.user.email.split("@")[0],
          avatar: session.user.user_metadata?.avatar || "💀",
          badge: session.user.user_metadata?.badge || "🤘 Headbanger",
        };
      } else {
        currentUser = null;
      }
      updateAuthUI();
    } catch (err) {
      console.warn("[Mural] Erro ao recuperar sessão:", err.message);
      currentUser = null;
      updateAuthUI();
    }

    // Escuta mudanças de estado de autenticação (Login / Logout / Refresh)
    supabaseClient.auth.onAuthStateChange((event, session) => {
      if (session && session.user) {
        currentUser = {
          id: session.user.id,
          email: session.user.email,
          name: session.user.user_metadata?.name || session.user.email.split("@")[0],
          avatar: session.user.user_metadata?.avatar || "💀",
          badge: session.user.user_metadata?.badge || "🤘 Headbanger",
        };
      } else {
        currentUser = null;
      }
      updateAuthUI();
    });
  }

  // 5. Atualiza a UI de autenticação (Barra do usuário e formulário)
  function updateAuthUI() {
    if (!elUserBar) return;

    if (currentUser) {
      elUserBar.innerHTML = `
        <div class="user-logged-box">
          <div class="user-avatar-badge">${escapeHtml(currentUser.avatar)}</div>
          <div class="user-info-text">
            <span class="user-name">${escapeHtml(currentUser.name)}</span>
            <span class="user-rock-badge">${escapeHtml(currentUser.badge)}</span>
          </div>
          <button class="btn-logout" id="btn-logout" title="Sair da conta">Sair</button>
        </div>
      `;
      const btnLogout = document.getElementById("btn-logout");
      if (btnLogout) {
        btnLogout.addEventListener("click", handleLogout);
      }

      if (elCommentInput) {
        elCommentInput.placeholder = `E aí ${currentUser.name}, deixe seu recado para a galera do Rock...`;
      }
    } else {
      elUserBar.innerHTML = `
        <div class="user-guest-box">
          <div class="guest-msg">
            <span class="guest-icon">💀</span>
            <span>Faça login ou cadastre-se para comentar com seu Avatar e Emblema Rock!</span>
          </div>
          <button class="btn-open-auth" id="btn-open-auth-bar">
            <span>🤘 Entrar / Cadastrar</span>
          </button>
        </div>
      `;
      const btnOpenAuth = document.getElementById("btn-open-auth-bar");
      if (btnOpenAuth) {
        btnOpenAuth.addEventListener("click", openAuthModal);
      }

      if (elCommentInput) {
        elCommentInput.placeholder = "Deixe seu recado no mural (Faça login para salvar seu perfil)...";
      }
    }
  }

  // 6. Manipulação de Login / Cadastro / Logout
  async function handleLogin(e) {
    e.preventDefault();
    if (!supabaseClient) return;

    const email = document.getElementById("login-email")?.value.trim();
    const password = document.getElementById("login-password")?.value;
    const btnSubmit = document.getElementById("btn-submit-login");
    const errorEl = document.getElementById("auth-login-error");

    if (!email || !password) {
      if (errorEl) errorEl.textContent = "Preencha e-mail e senha.";
      return;
    }

    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.textContent = "Entrando...";
    }
    if (errorEl) errorEl.textContent = "";

    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      showToast(`Bem-vindo de volta, ${data.user?.user_metadata?.name || "Headbanger"}! 🤘`, "success");
      closeAuthModal();
    } catch (err) {
      console.error("[Auth] Erro ao entrar:", err);
      let msg = "Falha no login. Verifique seu e-mail e senha.";
      const errMsg = (err.message || "").toLowerCase();
      if (errMsg.includes("invalid login credentials")) {
        msg = "E-mail ou senha incorretos. Verifique se digitou corretamente ou se o e-mail precisa de confirmação no Supabase.";
      } else if (errMsg.includes("email not confirmed")) {
        msg = "E-mail ainda não confirmado! Verifique sua caixa de entrada ou desative a confirmação de e-mail no painel do Supabase.";
      } else if (err.message) {
        msg = err.message;
      }
      if (errorEl) errorEl.textContent = msg;
      showToast(msg, "error");
    } finally {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.textContent = "Entrar no Mural";
      }
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    if (!supabaseClient) return;

    const name = document.getElementById("reg-name")?.value.trim();
    const email = document.getElementById("reg-email")?.value.trim();
    const password = document.getElementById("reg-password")?.value;
    const btnSubmit = document.getElementById("btn-submit-reg");
    const errorEl = document.getElementById("auth-reg-error");

    if (!name || name.length < 2) {
      if (errorEl) errorEl.textContent = "Digite um nome ou apelido (mínimo 2 letras).";
      return;
    }
    if (!email || !password || password.length < 6) {
      if (errorEl) errorEl.textContent = "A senha deve ter pelo menos 6 caracteres.";
      return;
    }

    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.textContent = "Criando conta...";
    }
    if (errorEl) errorEl.textContent = "";

    try {
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          data: {
            name,
            avatar: selectedAvatar,
            badge: selectedBadge,
          },
        },
      });

      if (error) throw error;

      // Se o Supabase exigir confirmação por e-mail, session virá nulo
      if (data?.user && !data?.session && data?.user?.identities?.length > 0) {
        showToast(`Conta criada! Verifique seu e-mail para confirmar antes de logar. 🤘`, "info");
        if (errorEl) {
          errorEl.style.color = "#fbbf24";
          errorEl.textContent = "Conta criada! Se a confirmação de e-mail estiver ativa no Supabase, confirme o link no seu e-mail antes de fazer login.";
        }
      } else {
        showToast(`Conta criada com sucesso! Bem-vindo, ${name}! 🤘`, "success");
        closeAuthModal();
      }
    } catch (err) {
      console.error("[Auth] Erro ao cadastrar:", err);
      let msg = err.message || "Erro ao criar conta.";
      const errMsg = (err.message || "").toLowerCase();
      if (errMsg.includes("user already registered")) {
        msg = "Este e-mail já possui cadastro. Tente fazer login.";
      }
      if (errorEl) {
        errorEl.style.color = "";
        errorEl.textContent = msg;
      }
      showToast(msg, "error");
    } finally {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.textContent = "Concluir Cadastro 🤘";
      }
    }
  }

  async function handleLogout() {
    if (!supabaseClient) return;
    try {
      await supabaseClient.auth.signOut();
      currentUser = null;
      updateAuthUI();
      showToast("Você saiu da sua conta.", "info");
    } catch (err) {
      console.error("[Auth] Erro ao sair:", err);
    }
  }

  // 7. Busca comentários do Supabase
  async function fetchComments() {
    if (!supabaseClient) {
      renderFallbackComments();
      return;
    }

    const tableName = (CFG.SUPABASE_TABLE_COMMENTS || "comentarios_mural").trim();

    try {
      const { data, error } = await supabaseClient
        .from(tableName)
        .select("*")
        .eq("aprovado", true)
        .order("created_at", { ascending: false })
        .limit(60);

      if (error) throw error;

      if (data && data.length > 0) {
        commentsData = data;
      } else {
        renderFallbackComments();
        return;
      }

      renderComments();
    } catch (err) {
      console.warn("[Mural] Erro ao buscar comentários no Supabase:", err.message);
      renderFallbackComments();
    }
  }

  // Renderiza comentários padrão caso o banco esteja vazio ou em caso de erro
  function renderFallbackComments() {
    commentsData = [
      {
        id: "def-1",
        nome: "Diego Metalhead",
        avatar_url: "💀",
        mensagem: "Salve galera da Rádio Caveira! Essa rádio é pedrada pura, sintonizado aqui de Curitiba! 🤘🔥",
        rock_badge: "🤘 Headbanger",
        likes_count: 5,
        created_at: new Date(Date.now() - 45 * 60000).toISOString(),
      },
      {
        id: "def-2",
        nome: "Camila Rocker",
        avatar_url: "🎸",
        mensagem: "Tocou Sepultura agorinha! Simplesmente a melhor rádio de rock do Brasil! ⚡",
        rock_badge: "🔥 Fã VIP",
        likes_count: 8,
        created_at: new Date(Date.now() - 25 * 60000).toISOString(),
      },
      {
        id: "def-3",
        nome: "Mestre do Riff",
        avatar_url: "⚡",
        mensagem: "Aumenta o volume que hoje é dia de muito Heavy Metal e Underground!",
        rock_badge: "🎸 Guitar Hero",
        likes_count: 12,
        created_at: new Date(Date.now() - 10 * 60000).toISOString(),
      },
    ];
    renderComments();
  }

  // 8. Renderiza a lista de comentários no DOM
  function renderComments() {
    if (!elCommentsList) return;

    if (elCommentsCount) {
      elCommentsCount.textContent = commentsData.length;
    }

    if (commentsData.length === 0) {
      elCommentsList.innerHTML = `
        <div class="comments-empty-state">
          <span class="empty-icon">🎸</span>
          <h3>Seja o primeiro a deixar um recado!</h3>
          <p>Escreva sua mensagem acima e agite o mural dos Headbangers.</p>
        </div>
      `;
      return;
    }

    const html = commentsData.map((item, index) => {
      const isLiked = likedCommentIds.has(item.id);
      const isMine = currentUser && currentUser.id === item.user_id;

      return `
        <article class="comment-card ${index === 0 ? 'comment-new' : ''}" data-id="${item.id}">
          <div class="comment-header">
            <div class="comment-author-wrap">
              <div class="comment-avatar" title="${escapeHtml(item.nome)}">${escapeHtml(item.avatar_url || '💀')}</div>
              <div class="comment-author-info">
                <span class="comment-author-name">${escapeHtml(item.nome)} ${isMine ? '<span class="my-badge">(Você)</span>' : ''}</span>
                <span class="comment-badge">${escapeHtml(item.rock_badge || '🤘 Headbanger')}</span>
              </div>
            </div>
            <time class="comment-time" title="${item.created_at || ''}">${timeAgo(item.created_at)}</time>
          </div>

          <div class="comment-body">
            <p class="comment-text">${escapeHtml(item.mensagem)}</p>
          </div>

          <div class="comment-footer">
            <button class="btn-comment-like ${isLiked ? 'liked' : ''}" data-action="like" data-id="${item.id}" title="Curtir comentário">
              <span class="like-icon">${isLiked ? '🔥' : '🤘'}</span>
              <span class="like-count">${item.likes_count || 0}</span>
            </button>
          </div>
        </article>
      `;
    }).join("");

    elCommentsList.innerHTML = html;

    // Conecta cliques no botão de curtir
    elCommentsList.querySelectorAll(".btn-comment-like").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const id = btn.getAttribute("data-id");
        if (id) handleLike(id);
      });
    });
  }

  // 9. Envio de Novo Comentário
  async function handleCommentSubmit(e) {
    e.preventDefault();

    const rawText = elCommentInput ? elCommentInput.value.trim() : "";
    if (!rawText || rawText.length < 2) {
      showToast("Escreva pelo menos 2 caracteres.", "error");
      return;
    }
    if (rawText.length > 600) {
      showToast("Comentário muito longo (máximo 600 caracteres).", "error");
      return;
    }

    const btnSubmit = document.getElementById("btn-post-comment");
    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.innerHTML = `<span>Enviando...</span>`;
    }

    const authorName = currentUser ? currentUser.name : "Ouvinte Anônimo";
    const authorAvatar = currentUser ? currentUser.avatar : "💀";
    const authorBadge = currentUser ? currentUser.badge : "🤘 Headbanger";
    const userId = currentUser ? currentUser.id : null;
    const userEmail = currentUser ? currentUser.email : null;

    const newCommentObj = {
      user_id: userId,
      nome: authorName,
      email: userEmail,
      avatar_url: authorAvatar,
      mensagem: rawText,
      rock_badge: authorBadge,
      likes_count: 0,
      aprovado: true,
      created_at: new Date().toISOString(),
    };

    if (!supabaseClient) {
      // Fallback local se não houver Supabase configurado
      newCommentObj.id = "local-" + Date.now();
      commentsData.unshift(newCommentObj);
      renderComments();
      if (elCommentInput) elCommentInput.value = "";
      updateCharCount();
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = `<span>Publicar Recado 🤘</span>`;
      }
      showToast("Comentário publicado no mural!", "success");
      return;
    }

    const tableName = (CFG.SUPABASE_TABLE_COMMENTS || "comentarios_mural").trim();

    try {
      const { data, error } = await supabaseClient
        .from(tableName)
        .insert([
          {
            user_id: userId,
            nome: authorName,
            email: userEmail,
            avatar_url: authorAvatar,
            mensagem: rawText,
            rock_badge: authorBadge,
            likes_count: 0,
            aprovado: true,
          },
        ])
        .select();

      if (error) throw error;

      if (elCommentInput) elCommentInput.value = "";
      updateCharCount();
      showToast("Seu recado foi publicado no mural com sucesso! 🤘", "success");

      // Adiciona localmente caso o Realtime demore milissegundos
      if (data && data[0]) {
        const exists = commentsData.some((c) => c.id === data[0].id);
        if (!exists) {
          commentsData.unshift(data[0]);
          renderComments();
        }
      }
    } catch (err) {
      console.error("[Mural] Erro ao postar comentário:", err);
      showToast("Erro ao publicar comentário. Tente novamente.", "error");
    } finally {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = `<span>Publicar Recado 🤘</span>`;
      }
    }
  }

  // 10. Curtir Comentário
  async function handleLike(commentId) {
    const isAlreadyLiked = likedCommentIds.has(commentId);
    const comment = commentsData.find((c) => c.id === commentId);
    if (!comment) return;

    if (isAlreadyLiked) {
      likedCommentIds.delete(commentId);
      comment.likes_count = Math.max(0, (comment.likes_count || 1) - 1);
    } else {
      likedCommentIds.add(commentId);
      comment.likes_count = (comment.likes_count || 0) + 1;
    }

    // Salva no localStorage
    try {
      localStorage.setItem("caveira_liked_comments", JSON.stringify(Array.from(likedCommentIds)));
    } catch (e) {}

    renderComments();

    if (!supabaseClient || String(commentId).startsWith("def-") || String(commentId).startsWith("local-")) {
      return;
    }

    const tableName = (CFG.SUPABASE_TABLE_COMMENTS || "comentarios_mural").trim();

    try {
      await supabaseClient
        .from(tableName)
        .update({ likes_count: comment.likes_count })
        .eq("id", commentId);
    } catch (err) {
      console.warn("[Mural] Falha ao atualizar curtida no Supabase:", err);
    }
  }

  // 11. Conexão com Supabase Realtime (WebSockets)
  function initRealtime() {
    if (!supabaseClient) return;

    const tableName = (CFG.SUPABASE_TABLE_COMMENTS || "comentarios_mural").trim();

    try {
      realtimeChannel = supabaseClient
        .channel("mural_realtime_channel")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: tableName,
          },
          (payload) => {
            if (payload.new && payload.new.aprovado) {
              const exists = commentsData.some((c) => c.id === payload.new.id);
              if (!exists) {
                commentsData.unshift(payload.new);
                renderComments();
                if (!currentUser || payload.new.user_id !== currentUser.id) {
                  showToast(`Novo recado de ${payload.new.nome}! 💬`, "info");
                }
              }
            }
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: tableName,
          },
          (payload) => {
            if (payload.new) {
              const idx = commentsData.findIndex((c) => c.id === payload.new.id);
              if (idx !== -1) {
                commentsData[idx] = { ...commentsData[idx], ...payload.new };
                renderComments();
              }
            }
          }
        )
        .on(
          "postgres_changes",
          {
            event: "DELETE",
            schema: "public",
            table: tableName,
          },
          (payload) => {
            if (payload.old && payload.old.id) {
              commentsData = commentsData.filter((c) => c.id !== payload.old.id);
              renderComments();
            }
          }
        )
        .subscribe();
    } catch (err) {
      console.warn("[Mural] Falha ao assinar Realtime do Supabase:", err);
    }
  }

  // 12. Modal de Autenticação (Abrir / Fechar / Trocar Abas)
  function openAuthModal(defaultTab = "login") {
    if (!elAuthModal) return;
    elAuthModal.classList.add("active");
    switchAuthTab(defaultTab);
    document.body.style.overflow = "hidden";
  }

  function closeAuthModal() {
    if (!elAuthModal) return;
    elAuthModal.classList.remove("active");
    document.body.style.overflow = "";
  }

  function switchAuthTab(tab) {
    const tabLogin = document.getElementById("tab-btn-login");
    const tabReg = document.getElementById("tab-btn-reg");
    const viewLogin = document.getElementById("auth-view-login");
    const viewReg = document.getElementById("auth-view-reg");

    if (tab === "login") {
      tabLogin?.classList.add("active");
      tabReg?.classList.remove("active");
      viewLogin?.classList.add("active");
      viewReg?.classList.remove("active");
    } else {
      tabLogin?.classList.remove("active");
      tabReg?.classList.add("active");
      viewLogin?.classList.remove("active");
      viewReg?.classList.add("active");
    }
  }

  // Contador de Caracteres
  function updateCharCount() {
    if (!elCommentInput || !elCharCount) return;
    const len = elCommentInput.value.length;
    elCharCount.textContent = `${len}/600`;
    if (len > 550) {
      elCharCount.classList.add("near-limit");
    } else {
      elCharCount.classList.remove("near-limit");
    }
  }

  // Inserção rápida de Emojis do Rock
  function insertEmoji(emoji) {
    if (!elCommentInput) return;
    const start = elCommentInput.selectionStart || 0;
    const end = elCommentInput.selectionEnd || 0;
    const text = elCommentInput.value;
    elCommentInput.value = text.substring(0, start) + emoji + text.substring(end);
    elCommentInput.focus();
    elCommentInput.selectionStart = elCommentInput.selectionEnd = start + emoji.length;
    updateCharCount();
  }

  // 13. Inicialização Principal do Módulo
  function init() {
    elCommentsList = document.getElementById("comments-feed-list");
    elCommentForm = document.getElementById("comment-form");
    elCommentInput = document.getElementById("comment-input");
    elCharCount = document.getElementById("comment-char-count");
    elCommentsCount = document.getElementById("comments-total-badge");
    elAuthBtnHeader = document.getElementById("btn-auth-header");
    elUserBar = document.getElementById("mural-user-bar");
    elAuthModal = document.getElementById("auth-modal");
    elAuthFormLogin = document.getElementById("form-auth-login");
    elAuthFormRegister = document.getElementById("form-auth-register");

    initSupabase();

    // Eventos do formulário de comentários
    if (elCommentForm) {
      elCommentForm.addEventListener("submit", handleCommentSubmit);
    }
    if (elCommentInput) {
      elCommentInput.addEventListener("input", updateCharCount);
    }

    // Botões de Emojis do Rock
    document.querySelectorAll(".rock-emoji-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const emoji = btn.getAttribute("data-emoji");
        if (emoji) insertEmoji(emoji);
      });
    });

    // Seletor de Avatar no Cadastro
    document.querySelectorAll(".avatar-select-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".avatar-select-btn").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        selectedAvatar = btn.getAttribute("data-avatar") || "💀";
      });
    });

    // Seletor de Emblema no Cadastro
    document.querySelectorAll(".badge-select-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".badge-select-btn").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        selectedBadge = btn.getAttribute("data-badge") || "🤘 Headbanger";
      });
    });

    // Modal de Autenticação
    if (elAuthBtnHeader) {
      elAuthBtnHeader.addEventListener("click", () => openAuthModal("login"));
    }

    document.querySelectorAll(".close-auth-modal").forEach((btn) => {
      btn.addEventListener("click", closeAuthModal);
    });

    document.getElementById("tab-btn-login")?.addEventListener("click", () => switchAuthTab("login"));
    document.getElementById("tab-btn-reg")?.addEventListener("click", () => switchAuthTab("register"));
    document.getElementById("switch-to-register")?.addEventListener("click", () => switchAuthTab("register"));
    document.getElementById("switch-to-login")?.addEventListener("click", () => switchAuthTab("login"));

    if (elAuthFormLogin) {
      elAuthFormLogin.addEventListener("submit", handleLogin);
    }
    if (elAuthFormRegister) {
      elAuthFormRegister.addEventListener("submit", handleRegister);
    }

    // Fecha modal clicando fora do backdrop
    if (elAuthModal) {
      elAuthModal.addEventListener("click", (e) => {
        if (e.target === elAuthModal) closeAuthModal();
      });
    }

    // Carrega sessão, comentários e inicia Realtime
    checkAuthSession();
    fetchComments();
    initRealtime();

    // Atualiza os tempos relativos a cada 40 segundos
    setInterval(() => {
      document.querySelectorAll(".comment-card").forEach((card) => {
        const id = card.getAttribute("data-id");
        const timeEl = card.querySelector(".comment-time");
        const comment = commentsData.find((c) => c.id === id);
        if (comment && timeEl) {
          timeEl.textContent = timeAgo(comment.created_at);
        }
      });
    }, 40000);
  }

  // Executa no carregamento do DOM
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
