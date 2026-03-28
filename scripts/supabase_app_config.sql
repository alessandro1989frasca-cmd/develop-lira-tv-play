-- ================================================================
-- Tabella: app_config
-- Configurazione remota dell'app Lira TV Play.
-- Tabella a singola riga (id = 1) — modificabile da Supabase Dashboard.
-- ================================================================

CREATE TABLE IF NOT EXISTS app_config (
  id integer PRIMARY KEY DEFAULT 1,

  -- URL dello stream HLS live
  live_stream_url text NOT NULL DEFAULT 'https://a928c0678d284da5b383f29ecc5dfeec.msvdn.net/live/S57315730/8kTBWibNteJA/playlist.m3u8',

  -- URL immagine banner "Segui la diretta" (NULL = usa asset locale live-banner.jpg)
  live_banner_image_url text DEFAULT NULL,

  -- Mostra/nasconde il pulsante "Segui la diretta" in homepage
  live_banner_enabled boolean NOT NULL DEFAULT true,

  -- Testo del pulsante "Segui la diretta"
  live_banner_label text NOT NULL DEFAULT 'SEGUI LA DIRETTA',

  -- Timestamp ultimo aggiornamento (aggiornato automaticamente)
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Vincolo: garantisce che esista al massimo una riga
ALTER TABLE app_config
  ADD CONSTRAINT app_config_single_row CHECK (id = 1);

-- Aggiorna automaticamente updated_at ad ogni modifica
CREATE OR REPLACE FUNCTION set_app_config_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER app_config_updated_at
  BEFORE UPDATE ON app_config
  FOR EACH ROW EXECUTE FUNCTION set_app_config_updated_at();

-- ----------------------------------------------------------------
-- Riga di default (da eseguire una sola volta)
-- ----------------------------------------------------------------
INSERT INTO app_config (
  id,
  live_stream_url,
  live_banner_image_url,
  live_banner_enabled,
  live_banner_label
) VALUES (
  1,
  'https://a928c0678d284da5b383f29ecc5dfeec.msvdn.net/live/S57315730/8kTBWibNteJA/playlist.m3u8',
  NULL,
  true,
  'SEGUI LA DIRETTA'
) ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------
-- Row Level Security — solo lettura anonima (nessuna scrittura pubblica)
-- ----------------------------------------------------------------
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

-- Permette a tutti (anche utenti non autenticati) di leggere la config
CREATE POLICY "anon_select"
  ON app_config
  FOR SELECT
  TO anon
  USING (true);

-- Solo i service-role/admin possono modificare
-- (nessuna policy INSERT/UPDATE/DELETE per anon)
