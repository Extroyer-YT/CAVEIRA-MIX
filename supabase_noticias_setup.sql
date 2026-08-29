-- ============================================================
-- Caveira Mix — Tabela de Notícias & Lançamentos do Mundo do Rock
-- Execute este script no SQL Editor do seu Supabase
-- ============================================================

-- 1. Criação da tabela de notícias
CREATE TABLE IF NOT EXISTS public.noticias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo TEXT NOT NULL,
    descricao TEXT NOT NULL,
    categoria TEXT DEFAULT 'metal',
    categoria_label TEXT DEFAULT 'Heavy Metal',
    imagem_url TEXT DEFAULT '/live/assets/logo.png',
    fonte TEXT DEFAULT 'Caveira Mix / Mundo do Rock',
    link TEXT,
    data_publicacao TEXT DEFAULT 'Hoje',
    destaque BOOLEAN DEFAULT false,
    ordem INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Habilita Row Level Security (RLS)
ALTER TABLE public.noticias ENABLE ROW LEVEL SECURITY;

-- 3. Políticas de acesso seguro (Leitura pública e gravação/edição)
DROP POLICY IF EXISTS "Leitura pública de notícias" ON public.noticias;
CREATE POLICY "Leitura pública de notícias"
ON public.noticias
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Inserção e edição de notícias" ON public.noticias;
CREATE POLICY "Inserção e edição de notícias"
ON public.noticias
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- 4. Inserção das notícias iniciais (editáveis no Table Editor)
INSERT INTO public.noticias (titulo, descricao, categoria, categoria_label, imagem_url, fonte, link, data_publicacao, destaque, ordem)
VALUES 
(
    'Metallica anuncia novas datas mundiais da turnê M72 com palco 360° eletrizante',
    'A lendária banda de thrash metal confirma novas apresentações históricas com repertório duplo sem repetição de faixas entre as noites.',
    'metal',
    'Heavy Metal',
    'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=600&auto=format&fit=crop&q=80',
    'Caveira Mix / Rock News',
    'https://www.google.com/search?q=Metallica+M72+tour',
    'Hoje às 14:30',
    true,
    1
),
(
    'Iron Maiden celebra 50 anos de história com turnê mundial grandiosa',
    'Bruce Dickinson e Steve Harris prometem um setlist lendário com hinos épicos dos primeiros álbuns e cenários monumentais de Eddie.',
    'metal',
    'Heavy Metal',
    'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&auto=format&fit=crop&q=80',
    'Caveira Mix / Heavy World',
    'https://www.google.com/search?q=Iron+Maiden+Run+For+Your+Lives+World+Tour',
    'Hoje às 11:15',
    false,
    2
),
(
    'Sepultura encerra turnê histórica de despedida Celebrating Life Through Death com ingressos esgotados',
    'Andreas Kisser e Greyson Nekrutman conduzem apresentações avassaladoras celebrando 40 anos da maior banda de metal da história do Brasil.',
    'nacional',
    'Rock Nacional',
    'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=600&auto=format&fit=crop&q=80',
    'Whiplash / Caveira Mix',
    'https://www.google.com/search?q=Sepultura+despedida+turne',
    'Hoje às 09:00',
    false,
    3
),
(
    'Bangers Open Air e Monsters of Rock confirmam line-ups pesadíssimos no Brasil',
    'Os maiores festivais de metal da América Latina preparam palcos monumentais com lendas internacionais do Power, Thrash e Heavy Metal.',
    'festivais',
    'Festivais & Shows',
    'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80',
    'RockBizz / Festivais',
    'https://www.google.com/search?q=Bangers+Open+Air+Monsters+of+Rock+Brasil',
    'Ontem às 17:00',
    false,
    4
),
(
    'Ghost lança novo single bombástico e prepara próximo capítulo teatral',
    'Tobias Forge apresenta nova era visual e sonora misteriosa com guitarras pesadas e refrões grandiosos de arena rock.',
    'lancamentos',
    'Lançamentos',
    'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80',
    'Blabbermouth / Caveira Mix',
    'https://www.google.com/search?q=Ghost+band+new+album+single',
    'Há 2 dias',
    false,
    5
),
(
    'AC/DC incendeia multidões com Brian Johnson e Angus Young em forma espetacular',
    'Aos 69 anos, Angus Young continua correndo de ponta a ponta no palco e executando os solos mais eletrizantes do Hard Rock.',
    'classico',
    'Rock Clássico',
    'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=600&auto=format&fit=crop&q=80',
    'Classic Rock Magazine',
    'https://www.google.com/search?q=ACDC+Power+Up+tour',
    'Há 3 dias',
    false,
    6
)
ON CONFLICT DO NOTHING;

-- 5. Habilita Realtime no Supabase para a tabela de notícias
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'noticias'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.noticias;
    END IF;
END $$;
