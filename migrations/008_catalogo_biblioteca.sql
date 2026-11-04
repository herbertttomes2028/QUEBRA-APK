-- 008: catálogo da biblioteca no banco (categorias e imagens), com validação rígida no próprio banco.
-- O jogo só LÊ estas tabelas (library.js valida tudo de novo ao carregar); novos lotes entram por migração numerada e revisada no Pull request
-- (scripts/gerar-lote-imagens.js). O banco guarda apenas NOMES de arquivo: a URL é montada pelo servidor (MEDIA_BASE_URL), nunca vem daqui.
-- Segurança em profundidade: RLS ligado, sem políticas (o dono do banco, que é o que o jogo usa, não é afetado; qualquer outro papel não lê nem escreve).
-- Nada existente é alterado: library_clears e library_unlocks (006) continuam apontando para os mesmos nomes de arquivo.

CREATE TABLE IF NOT EXISTS library_categories (
  id         text PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9-]{1,39}$'),
  name       text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  subtitle   text NOT NULL DEFAULT '' CHECK (char_length(subtitle) <= 100),
  icon       text NOT NULL DEFAULT '' CHECK (char_length(icon) <= 8),
  sort_order integer NOT NULL UNIQUE CHECK (sort_order BETWEEN 1 AND 1000),
  unlock     text NOT NULL CHECK (unlock IN ('free', 'after', 'gems')),     -- free = aberta; after = abre ao concluir "requires"; gems = compra permanente
  requires   text REFERENCES library_categories(id),
  unlock_gate integer CHECK (unlock_gate IS NULL OR unlock_gate BETWEEN 1 AND 200),  -- "after": só as N primeiras imagens (por ordem) precisam estar concluídas; NULL = todas
  price      integer NOT NULL DEFAULT 0 CHECK (price BETWEEN 0 AND 1000),
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((unlock = 'after') = (requires IS NOT NULL)),
  CHECK (requires IS DISTINCT FROM id),
  CHECK ((unlock = 'gems') = (price > 0))
);

CREATE TABLE IF NOT EXISTS library_images (
  file         text PRIMARY KEY CHECK (file ~ '^[a-z0-9][a-z0-9._-]{2,79}\.webp$'),
  category_id  text NOT NULL REFERENCES library_categories(id),
  label        text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 60),
  sort_order   integer NOT NULL CHECK (sort_order BETWEEN 1 AND 10000),
  width        integer NOT NULL CHECK (width BETWEEN 64 AND 4096),
  height       integer NOT NULL CHECK (height BETWEEN 64 AND 4096),
  bytes        integer NOT NULL CHECK (bytes BETWEEN 1 AND 524288),
  sha256       text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),             -- impressão digital do arquivo (também serve de versão no cache)
  thumb_sha256 text CHECK (thumb_sha256 IS NULL OR thumb_sha256 ~ '^[a-f0-9]{64}$'),
  source       text NOT NULL DEFAULT '' CHECK (char_length(source) <= 200),  -- de onde veio a imagem
  license      text NOT NULL DEFAULT '' CHECK (char_length(license) <= 200), -- licença / permissão de uso
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_id, sort_order)
);
CREATE INDEX IF NOT EXISTS library_images_cat_idx ON library_images (category_id, sort_order) WHERE active;

ALTER TABLE library_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_images ENABLE ROW LEVEL SECURITY;

-- Carga inicial: as 5 categorias e as 25 imagens que o jogo já tem (a origem e a licença destas 25 ficam a confirmar).
-- unlock_gate = 5: a liberação continua exigindo as 5 primeiras imagens de cada categoria; imagens novas entram como conteúdo extra (não travam de novo quem já concluiu).
INSERT INTO library_categories (id, name, subtitle, icon, sort_order, unlock, requires, price, unlock_gate) VALUES
  ('fauna', 'Fauna brasileira', 'Encontros com os animais do Brasil', '🐾', 1, 'free', NULL, 0, 5),
  ('biomas', 'Natureza e biomas', 'Paisagens para descobrir', '🌿', 2, 'after', 'fauna', 0, 5),
  ('espaco', 'Espaço e ciência', 'Uma viagem pelo universo', '🪐', 3, 'after', 'biomas', 0, 5),
  ('cultura', 'Cultura brasileira', 'Nossa arte, nossa história', '🎨', 4, 'gems', NULL, 25, 5),
  ('fantasia', 'Mundos fantásticos', 'Aventuras de imaginação', '✨', 5, 'gems', NULL, 40, 5)
ON CONFLICT (id) DO NOTHING;

INSERT INTO library_images (file, category_id, label, sort_order, width, height, bytes, sha256, thumb_sha256, source, license) VALUES
  ('lib-fauna-01.webp', 'fauna', 'Onça-pintada', 1, 768, 1024, 171396, '059151a7cbd8f8140af48e7f9c36b3913b2341a250a427edda78a70c740b16cf', '4e337857a6ff1f990c97843db9bd6f70c63e4c1ee75870f555596575468344c6', 'acervo do jogo (origem a confirmar)', ''),
  ('lib-fauna-02.webp', 'fauna', 'Arara-azul', 2, 768, 1024, 173732, '87357383b2e33de9cee97f44a7fe09793fe655ec934f8bbd9051b345c127d2f5', '20f544e2038399575dda7476957be0b45590cb8f4d4c8ddb4f4801f5a13fa93c', 'acervo do jogo (origem a confirmar)', ''),
  ('lib-fauna-03.webp', 'fauna', 'Tucano-toco', 3, 768, 1024, 152498, 'de89d7fe85fb02e3b3b5ed0179fa906e213f507d2ed0c057a0beb8092e9e8f44', '90efc3214b19b8efda50a791d660b27c11f714d220c1f142fbf75de17d102436', 'acervo do jogo (origem a confirmar)', ''),
  ('lib-fauna-04.webp', 'fauna', 'Capivara do Pantanal', 4, 768, 1024, 158412, '01a5b2dc129a488566d6ed1334382bba4eb01fc3b939b3b492634ceb94cf3a72', 'bfac5a4a6bcbed6435a4691721868b268686344d392136a4fd1bf69336b2d8b1', 'acervo do jogo (origem a confirmar)', ''),
  ('lib-fauna-05.webp', 'fauna', 'Boto-cor-de-rosa', 5, 768, 1024, 115112, 'eb3858ff3bf454ed26684070e59a71e1fcb664c556cbc12e5327fc007f88acad', 'aa7d504539c8867e32335c16fa046a1e0efb9e7ba54d36d500286c2c4c770dbd', 'acervo do jogo (origem a confirmar)', ''),
  ('lib-biomas-01.webp', 'biomas', 'Cachoeira amazônica', 1, 768, 1024, 182488, '3e5f7ba0ec939ff3b3af604b0e20cbe84a003f94ff2df37d0a1a79a1d8aea25a', 'c1159b0d6d5c7b82620f5badb7da6283c3eefc17f5ed59d35d5b9a0fc8e4f302', 'acervo do jogo (origem a confirmar)', ''),
  ('lib-biomas-02.webp', 'biomas', 'Dunas dos Lençóis', 2, 768, 1024, 73836, '69c1f6cb894c67a255aa6bff673c85c6655160de36548f09bbb13a662ad8c2bc', '250125664b21b18e9f9828ae09e1e4cb85598a84ed5c0e82ff88c8da2a5ab422', 'acervo do jogo (origem a confirmar)', ''),
  ('lib-biomas-03.webp', 'biomas', 'Cerrado florido', 3, 768, 1024, 121516, 'dc5a884a9ea579ed8f9be900b83d1d134d49a521afefa56097aafdd4875a3394', 'a61d312ea50b5cc395b517433aa4de122496fa8307c2a7985e6567f72909cddc', 'acervo do jogo (origem a confirmar)', ''),
  ('lib-biomas-04.webp', 'biomas', 'Reflexos do Pantanal', 4, 768, 1024, 121670, '4548fdccd3155267b39727e27a2d779be1fe7d2b7dfb330474bf40fade65a928', '5977f5f3a2fac5635bcbb0019efa7f11dbe62d86a7f546893540d864afbb2697', 'acervo do jogo (origem a confirmar)', ''),
  ('lib-biomas-05.webp', 'biomas', 'Araucárias na serra', 5, 768, 1024, 159222, '4d2d2a2971ee5d58f77a1ad7372a4a3cf7a132e66a857b665a5f67021f3172ee', 'dc5c2c203a7ce86a369685fda1d9a81c01ade316d33a820695bec024c4193f8a', 'acervo do jogo (origem a confirmar)', ''),
  ('lib-espaco-01.webp', 'espaco', 'Saturno e seus anéis', 1, 768, 1024, 24024, '1bebc8cf271cf8ac6c9f7391fb79f1b758fa1f5208419eae49114c93fb869a81', '37df1bc4d1e29951f5cfe509401b5caee85bfa0c944246e6f70bd76ea695eb72', 'acervo do jogo (origem a confirmar)', ''),
  ('lib-espaco-02.webp', 'espaco', 'Astronauta explorador', 2, 768, 1024, 20810, '01d6e8002c454673270b93f9373f9a034a7b7df7f74f337636be2ad5072da16f', '8fb5681d8676c180c6e166261b6f32194753e4c1f505eea1e990cf2ab4b4fe8e', 'acervo do jogo (origem a confirmar)', ''),
  ('lib-espaco-03.webp', 'espaco', 'Paisagem lunar', 3, 768, 1024, 21282, 'f522238e6dee63a0c471c35c4ce5ddb5f7eca44a3af1d45db2a79aa8d30c055c', 'bb4f0f94cf16f9c03613786fe82f5c0004c36524240c15d62260f3f42156d20f', 'acervo do jogo (origem a confirmar)', ''),
  ('lib-espaco-04.webp', 'espaco', 'Nebulosa colorida', 4, 768, 1024, 21810, 'eb63601100e27e5e10f2e3459ec476974ee79e653386af52119f209af4dbeb24', 'f17eb834e7e0cccfbd91a2ec06c4e3e4fa642ac47f69612a94e672e9332c5960', 'acervo do jogo (origem a confirmar)', ''),
  ('lib-espaco-05.webp', 'espaco', 'Planeta Terra', 5, 768, 1024, 21988, 'abf67328da02b7cbd0198c07c4e1cd4bc3246ade04a326df83d21ac22c81ae85', 'f6d34de64e8a73318926c46bbdc2ce612187c6d150e39d81d0c7abe2d36320e6', 'acervo do jogo (origem a confirmar)', ''),
  ('lib-cultura-01.webp', 'cultura', 'Frevo em movimento', 1, 768, 1024, 131260, '5522c58eca089ce815d4407d80304d0f434a810c6e419ee322aa4fdd6bdfe157', '61f86880208edcdad64ad037d41c8394c84bd5fc2c683ebd32b883857e0771e0', 'acervo do jogo (origem a confirmar)', ''),
  ('lib-cultura-02.webp', 'cultura', 'Festa junina', 2, 768, 1024, 133278, 'fe1384da75949faf6411744b77b5f33d694e04b64aa279706d488f0a8f74c737', 'a9e20092d5f1f256d13f8dd03d1fae8372a8a599b684957360635b7b9b43799e', 'acervo do jogo (origem a confirmar)', ''),
  ('lib-cultura-03.webp', 'cultura', 'Capoeira ao entardecer', 3, 768, 1024, 63504, 'd43f26a44a0055eda04ebd3f1552a2441643ecc45e500f628bc2804c6f929f2c', '67e431b024dd8e594ae0dcfbf12de9f7bb5cdb8dfc026e0a4b40fc4b3c6b7e3a', 'acervo do jogo (origem a confirmar)', ''),
  ('lib-cultura-04.webp', 'cultura', 'Maracatu de cores', 4, 768, 1024, 209596, '7a85a1c376e32dcfa38a1a5b830e60fcb2e97aadb7f2cedbbe9224034ea406b7', '88610d808d7896d8226eb2c18941f1604160e089a96d8bab2cac9fdb1d1dd663', 'acervo do jogo (origem a confirmar)', ''),
  ('lib-cultura-05.webp', 'cultura', 'Renda do Nordeste', 5, 768, 1024, 111628, '374c3f5f067849b5057f42649bf825a3641052e0d97f6824f4bb7c700b79b169', '1a58056ee940df800ec0fe3b2966d5d088847edb889fc6c6f38501e46ba9276e', 'acervo do jogo (origem a confirmar)', ''),
  ('lib-fantasia-01.webp', 'fantasia', 'Dragão das montanhas', 1, 768, 1024, 144600, 'f7a94d35fd4b5a0193234e065622eeacd83fff5c15769b1220f62b1c39209273', 'df4d9bacec48a4440105fc34bcee059ef7bfc6cd6abc0e6d012abec34c88e3b6', 'acervo do jogo (origem a confirmar)', ''),
  ('lib-fantasia-02.webp', 'fantasia', 'Castelo nas nuvens', 2, 768, 1024, 121548, '7240433d680556d9faeed758fcff2c63a7e9930a9b4f1ade406dc5893a7eb1fa', '19320c3fd0aeed13a97c7a0a0ba35acfaafeca6dab7100667b96592ebafb5d32', 'acervo do jogo (origem a confirmar)', ''),
  ('lib-fantasia-03.webp', 'fantasia', 'Ilhas flutuantes', 3, 768, 1024, 138310, '5bb47075914e882019da75cf3d6669b1f62135b64655253edf8c44a9ee6d24a2', '44aacbddb98145e8dca044c7dade6c546b1338c76a31c0635d369452218c02c7', 'acervo do jogo (origem a confirmar)', ''),
  ('lib-fantasia-04.webp', 'fantasia', 'Bosque encantado', 4, 768, 1024, 146140, '8c4490efe201ffcc9860027b487b82c40f2363ab5748adbbe4221cb97886bd17', '26f3a6c13e35b8eb67d9ca112b667bd7ac13ed9ae7db334fd20a8c67da39f93f', 'acervo do jogo (origem a confirmar)', ''),
  ('lib-fantasia-05.webp', 'fantasia', 'Baleia das estrelas', 5, 768, 1024, 131798, 'ec66eac2027e1aaca66a774886f9c97ff9cfd38531c0cb5da62dd1a3cd20db98', '2e0c379ca8e816c54bd662f53fc4fcc80fc39ceae0c7026a08c5ef1b587808c6', 'acervo do jogo (origem a confirmar)', '')
ON CONFLICT (file) DO NOTHING;
