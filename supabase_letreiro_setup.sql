-- ============================================================
-- CAVEIRA MIX - TABELA DO QUADRO DE LED / LETREIRO (SUPABASE)
-- Execute este script no SQL Editor do seu painel Supabase
-- (Supabase > SQL Editor > New query > Run)
-- ============================================================

-- 1. Criação da tabela de recados e avisos do letreiro de LED
CREATE TABLE IF NOT EXISTS public.letreiro_led (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mensagem TEXT NOT NULL,
  autor TEXT DEFAULT 'Administração',
  tipo TEXT DEFAULT 'aviso', -- 'aviso', 'show', 'urgente', 'promocao', 'estacao'
  cor_led TEXT DEFAULT 'red', -- 'red', 'amber', 'green', 'cyan'
  ordem INTEGER DEFAULT 1,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Habilitar RLS (Row Level Security)
ALTER TABLE public.letreiro_led ENABLE ROW LEVEL SECURITY;

-- 3. Política de leitura pública (qualquer ouvinte pode ler os avisos ativos no letreiro)
DROP POLICY IF EXISTS "Leitura publica do letreiro de LED ativo" ON public.letreiro_led;
CREATE POLICY "Leitura publica do letreiro de LED ativo" 
ON public.letreiro_led 
FOR SELECT 
USING (ativo = true);

-- 4. Habilitar escuta em Tempo Real (Realtime)
-- Permite que novas mensagens enviadas pelo admin apareçam instantaneamente na tela
ALTER PUBLICATION supabase_realtime ADD TABLE public.letreiro_led;

-- 5. Inserir mensagens padrão da administração para testar imediatamente
INSERT INTO public.letreiro_led (mensagem, autor, tipo, cor_led, ordem, ativo)
VALUES 
  (
    '🤘 BEM-VINDO À CAVEIRA MIX! • A SUA RÁDIO ROCK, METAL & UNDERGROUND 24 HORAS NO AR!',
    'Administração',
    'aviso',
    'red',
    1,
    true
  ),
  (
    '📢 PEÇA SEU SOM: Clique na aba "Pedidos de Músicas" no menu e vote no seu som favorito do acervo!',
    'Programação',
    'promocao',
    'amber',
    2,
    true
  ),
  (
    '⚡ ESPECIAL SEXTA-FEIRA: Hoje às 20h tem Maratona Especial Black Sabbath, Dio e Iron Maiden com som no talo!',
    'Locução',
    'show',
    'red',
    3,
    true
  ),
  (
    '💀 AJUDE A RÁDIO: Compartilhe a Caveira Mix com os amigos headbangers nas redes sociais!',
    'Equipe Caveira',
    'aviso',
    'green',
    4,
    true
  );
