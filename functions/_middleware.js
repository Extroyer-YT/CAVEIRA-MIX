// ============================================================
//  Cloudflare Pages Function — Injeta variáveis de ambiente
//  seguras no HTML antes de entregá-lo ao navegador.
//
//  Como funciona:
//    1. O browser solicita /live/index.html
//    2. Este worker intercepta a resposta
//    3. Injeta um <script> com window.__ENV = { ... } no <head>
//    4. As chaves nunca ficam no código-fonte público
//
//  Arquivo: functions/_middleware.js
//  Cloudflare Pages detecta automaticamente esta pasta.
// ============================================================

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  // Só processa arquivos HTML
  if (!url.pathname.endsWith(".html") && !url.pathname.endsWith("/")) {
    return next();
  }

  const response = await next();

  // Só injeta em respostas HTML bem-sucedidas
  if (!response.headers.get("content-type")?.includes("text/html")) {
    return response;
  }

  // Monta o bloco de variáveis seguras para injetar no <head>
  const envScript = `
<script id="__caveira-env">
  window.__ENV = {
    OPENWEATHER_API_KEY: ${JSON.stringify(env.OPENWEATHER_API_KEY ?? "")},
    WORLD_NEWS_API_KEY:  ${JSON.stringify(env.WORLD_NEWS_API_KEY  ?? "")},
    SUPABASE_URL:        ${JSON.stringify(env.SUPABASE_URL        ?? "")},
    SUPABASE_ANON_KEY:   ${JSON.stringify(env.SUPABASE_ANON_KEY   ?? "")},
    LASTFM_API_KEY:      ${JSON.stringify(env.LASTFM_API_KEY      ?? "")},
    GNEWS_API_KEY:       ${JSON.stringify(env.GNEWS_API_KEY       ?? "")},
    NEWSAPI_KEY:         ${JSON.stringify(env.NEWSAPI_KEY         ?? "")},
    AZURACAST_API_KEY:   ${JSON.stringify(env.AZURACAST_API_KEY   ?? "")},
  };
</script>`;

  // Usa um HTMLRewriter para injetar o script logo antes de </head>
  const rewriter = new HTMLRewriter().on("head", {
    element(element) {
      element.append(envScript, { html: true });
    },
  });

  return rewriter.transform(response);
}
