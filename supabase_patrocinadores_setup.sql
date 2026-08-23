-- ============================================================
-- CAVEIRA MIX - TABELA DE PATROCINADORES (SUPABASE)
-- Execute este script no SQL Editor do seu painel Supabase
-- (Supabase > SQL Editor > New query > Run)
-- ============================================================

-- 1. Criação da tabela de patrocinadores
CREATE TABLE IF NOT EXISTS public.patrocinadores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  descricao TEXT,
  imagem_url TEXT NOT NULL,
  link_url TEXT,
  categoria TEXT DEFAULT 'Patrocinador Oficial',
  ordem INTEGER DEFAULT 1,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Habilitar RLS (Row Level Security)
ALTER TABLE public.patrocinadores ENABLE ROW LEVEL SECURITY;

-- 3. Política de leitura pública (qualquer visitante pode ver patrocinadores ativos)
DROP POLICY IF EXISTS "Leitura publica de patrocinadores ativos" ON public.patrocinadores;
CREATE POLICY "Leitura publica de patrocinadores ativos" 
ON public.patrocinadores 
FOR SELECT 
USING (ativo = true);

-- 4. Inserir patrocinadores de exemplo para testar imediatamente
INSERT INTO public.patrocinadores (nome, descricao, imagem_url, link_url, categoria, ordem, ativo)
VALUES 
  (
    'Caveira Rock Store',
    'Camisetas, discos de vinil, botas e acessórios do bom e velho Rock & Metal.',
    'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80',
    'https://caveira-mix.uk/',
    'Patrocinador Master',
    1,
    true
  ),
  (
    'Hellfire Custom Guitars',
    'Luthieria especializada, regulagens pesadas e guitarras customizadas.',
    'https://images.unsplash.com/photo-1525201548942-d8732f6617a0?w=500&auto=format&fit=crop&q=80',
    'https://caveira-mix.uk/',
    'Apoio Cultural',
    2,
    true
  ),
  (
    'Underground Pub & Tattoo',
    'Cervejas artesanais, os melhores petiscos e flash tattoos exclusivas.',
    'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=500&auto=format&fit=crop&q=80',
    'https://caveira-mix.uk/',
    'Parceiro Oficial',
    3,
    true
  );

-- ============================================================
-- PRONTO! 
-- Agora basta adicionar/editar linhas na tabela "patrocinadores" 
-- no menu Table Editor do Supabase para atualizar o site em tempo real.
-- ============================================================
