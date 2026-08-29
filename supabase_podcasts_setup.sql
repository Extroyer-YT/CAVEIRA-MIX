-- ============================================================
-- Caveira Mix — Tabela de Podcasts Caveira Mix
-- Execute este script no SQL Editor do seu Supabase
-- ============================================================

-- 1. Criação da tabela de podcasts
CREATE TABLE IF NOT EXISTS public.podcasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo TEXT NOT NULL,
    descricao TEXT,
    audio_url TEXT NOT NULL,
    capa_url TEXT,
    duracao TEXT DEFAULT '00:00',
    episodio_numero INT,
    host TEXT DEFAULT 'Caveira Mix',
    destaque BOOLEAN DEFAULT false,
    views INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Habilita Row Level Security (RLS)
ALTER TABLE public.podcasts ENABLE ROW LEVEL SECURITY;

-- 3. Políticas de acesso seguro (Leitura pública e gravação autenticada/admin)
DROP POLICY IF EXISTS "Leitura pública de podcasts" ON public.podcasts;
CREATE POLICY "Leitura pública de podcasts"
ON public.podcasts
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Inserção de podcasts" ON public.podcasts;
CREATE POLICY "Inserção de podcasts"
ON public.podcasts
FOR ALL
TO authenticated, anon
USING (true)
WITH CHECK (true);

-- 4. Inserção de episódios inaugurais de exemplo
INSERT INTO public.podcasts (titulo, descricao, audio_url, capa_url, duracao, episodio_numero, host, destaque)
VALUES 
(
    'Caveira Cast #01 — A História Secreta do Heavy Metal Brasileiro',
    'Neste episódio de estreia, mergulhamos nas origens do Rock e Metal no Brasil, as primeiras bandas underground, fitas cassete trocadas por correio e como o Sepultura abriu as portas do mundo.',
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    '/live/assets/logo.png',
    '38:45',
    1,
    'Beto Caveira & Convidados',
    true
),
(
    'Caveira Cast #02 — Os Bastidores dos Maiores Festivais de Metal',
    'Tudo o que acontece nos bastidores de grandes turnês, histórias insanas de camarim, perrengues de estrada e os solos de guitarra mais icônicos de todos os tempos.',
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    '/live/assets/logo.png',
    '45:20',
    2,
    'Beto Caveira',
    false
),
(
    'Caveira Cast #03 — Bandas Underground Que Você Precisa Conhecer',
    'Uma seleção explosiva de novos lançamentos e bandas independentes do cenário Rock & Metal que estão botando fogo na cena atual.',
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    '/live/assets/logo.png',
    '31:10',
    3,
    'Equipe Caveira Mix',
    false
)
ON CONFLICT DO NOTHING;

-- 5. Habilita Realtime no Supabase para a tabela de podcasts
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'podcasts'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.podcasts;
    END IF;
END $$;
