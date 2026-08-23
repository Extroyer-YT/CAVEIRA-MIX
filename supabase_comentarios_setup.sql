-- ============================================================
-- CAVEIRA MIX - QUADRO / MURAL DE COMENTÁRIOS COM AUTENTICAÇÃO
-- Execute este script no SQL Editor do seu painel Supabase
-- https://supabase.com/dashboard/project/dycirxcxwnmuzhwbpltv/sql
-- ============================================================

-- 1. Criação da tabela principal de comentários do mural
CREATE TABLE IF NOT EXISTS public.comentarios_mural (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  email TEXT,
  avatar_url TEXT DEFAULT '💀',
  mensagem TEXT NOT NULL CHECK (char_length(trim(mensagem)) >= 2 AND char_length(mensagem) <= 600),
  rock_badge TEXT DEFAULT '🤘 Headbanger',
  likes_count INT NOT NULL DEFAULT 0,
  aprovado BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para alta performance nas buscas e ordenações
CREATE INDEX IF NOT EXISTS idx_comentarios_created_at ON public.comentarios_mural (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comentarios_aprovado ON public.comentarios_mural (aprovado);
CREATE INDEX IF NOT EXISTS idx_comentarios_user_id ON public.comentarios_mural (user_id);

-- 2. Criação da tabela de controle de curtidas (evita curtidas duplicadas)
CREATE TABLE IF NOT EXISTS public.comentarios_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comentario_id UUID NOT NULL REFERENCES public.comentarios_mural(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ip_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unq_comentario_user UNIQUE(comentario_id, user_id)
);

-- 3. Habilita Segurança por Nível de Linha (RLS)
ALTER TABLE public.comentarios_mural ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comentarios_likes ENABLE ROW LEVEL SECURITY;

-- 4. Políticas de Segurança (RLS) para comentarios_mural
-- Leitura pública: qualquer visitante pode ver comentários aprovados
DROP POLICY IF EXISTS "Leitura publica de comentarios aprovados" ON public.comentarios_mural;
CREATE POLICY "Leitura publica de comentarios aprovados"
  ON public.comentarios_mural
  FOR SELECT
  USING (aprovado = true);

-- Inserção: usuários autenticados ou anônimos com sessão podem enviar comentários
DROP POLICY IF EXISTS "Insercao de novos comentarios" ON public.comentarios_mural;
CREATE POLICY "Insercao de novos comentarios"
  ON public.comentarios_mural
  FOR INSERT
  WITH CHECK (
    char_length(trim(mensagem)) >= 2 
    AND char_length(mensagem) <= 600
    AND char_length(trim(nome)) >= 2
  );

-- Atualização de likes: permite atualizar a contagem de curtidas
DROP POLICY IF EXISTS "Atualizacao de likes nos comentarios" ON public.comentarios_mural;
CREATE POLICY "Atualizacao de likes nos comentarios"
  ON public.comentarios_mural
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- 5. Políticas de Segurança (RLS) para comentarios_likes
DROP POLICY IF EXISTS "Leitura publica de likes" ON public.comentarios_likes;
CREATE POLICY "Leitura publica de likes"
  ON public.comentarios_likes
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Insercao de likes" ON public.comentarios_likes;
CREATE POLICY "Insercao de likes"
  ON public.comentarios_likes
  FOR INSERT
  WITH CHECK (true);

-- 6. Habilita Supabase Realtime na tabela de comentários
-- (Permite sincronização instantânea via WebSockets para todos os ouvintes)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.comentarios_mural;
  EXCEPTION
    WHEN duplicate_object THEN
      NULL; -- Tabela já estava na publicação
  END;
END $$;

-- 7. Inserção de mensagens iniciais de boas-vindas dos Headbangers
INSERT INTO public.comentarios_mural (nome, avatar_url, mensagem, rock_badge, likes_count, created_at)
VALUES
  ('Diego Metalhead', '💀', 'Salve galera da Caveira Mix! Essa rádio é pedrada pura, sintonizado aqui de Curitiba! 🤘🔥', '🤘 Headbanger', 5, now() - INTERVAL '45 minutes'),
  ('Camila Rocker', '🎸', 'Tocou Sepultura agorinha! Simplesmente a melhor rádio de rock do Brasil! ⚡', '🔥 Fã VIP', 8, now() - INTERVAL '30 minutes'),
  ('Mestre do Riff', '⚡', 'Aumenta o volume que hoje é dia de muito Heavy Metal e Underground!', '🎸 Guitar Hero', 12, now() - INTERVAL '15 minutes')
ON CONFLICT DO NOTHING;
