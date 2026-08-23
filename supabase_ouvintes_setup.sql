-- ============================================================
-- Caveira Mix — Tabela de Ouvintes em Tempo Real no Mapa
-- Execute este script no SQL Editor do seu Supabase
-- ============================================================

-- 1. Criação da tabela de ouvintes ativos
CREATE TABLE IF NOT EXISTS public.ouvintes_online (
    session_id TEXT PRIMARY KEY,
    cidade TEXT NOT NULL,
    estado TEXT,
    pais TEXT NOT NULL,
    codigo_pais TEXT,
    lat NUMERIC(7, 4) NOT NULL,
    lng NUMERIC(7, 4) NOT NULL,
    ouvindo BOOLEAN DEFAULT true,
    last_ping TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Habilita Row Level Security (RLS)
ALTER TABLE public.ouvintes_online ENABLE ROW LEVEL SECURITY;

-- 3. Políticas de acesso seguro (Leitura pública e inserção/atualização anônima)
DROP POLICY IF EXISTS "Leitura pública de ouvintes online" ON public.ouvintes_online;
CREATE POLICY "Leitura pública de ouvintes online"
ON public.ouvintes_online
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Inserção anônima de ping de ouvinte" ON public.ouvintes_online;
CREATE POLICY "Inserção anônima de ping de ouvinte"
ON public.ouvintes_online
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Atualização anônima de heartbeat de ouvinte" ON public.ouvintes_online;
CREATE POLICY "Atualização anônima de heartbeat de ouvinte"
ON public.ouvintes_online
FOR UPDATE
TO anon, authenticated
USING (true);

-- 4. Função e trigger para limpeza periódica de ouvintes inativos (> 3 minutos)
CREATE OR REPLACE FUNCTION limpar_ouvintes_inativos()
RETURNS void AS $$
BEGIN
    DELETE FROM public.ouvintes_online
    WHERE last_ping < (timezone('utc'::text, now()) - INTERVAL '3 minutes');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Habilita Realtime no Supabase para a tabela de ouvintes
ALTER PUBLICATION supabase_realtime ADD TABLE public.ouvintes_online;
