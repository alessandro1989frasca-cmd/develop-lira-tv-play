-- ================================================================
-- Tabella: breaking_news
-- Breaking news mostrate in cima alla sezione News dell'app.
-- Modificabile da Supabase Dashboard (Table Editor).
-- ================================================================

CREATE TABLE IF NOT EXISTS breaking_news (
  id serial PRIMARY KEY,

  -- Titolo breve della breaking news (es. "BREAKING: Terremoto in Calabria")
  titolo text NOT NULL DEFAULT '',

  -- Testo esteso opzionale (es. dettagli aggiuntivi)
  descrizione text NOT NULL DEFAULT '',

  -- URL all'articolo completo (opzionale, NULL = nessun link)
  url text DEFAULT NULL,

  -- Se true, la breaking news è visibile in cima alle news dell'app
  attiva boolean NOT NULL DEFAULT false,

  -- Timestamp creazione e aggiornamento
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Aggiorna automaticamente updated_at ad ogni modifica
CREATE OR REPLACE FUNCTION set_breaking_news_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER breaking_news_updated_at
  BEFORE UPDATE ON breaking_news
  FOR EACH ROW EXECUTE FUNCTION set_breaking_news_updated_at();

-- ----------------------------------------------------------------
-- Row Level Security — solo lettura anonima (nessuna scrittura pubblica)
-- ----------------------------------------------------------------
ALTER TABLE breaking_news ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select"
  ON breaking_news
  FOR SELECT
  TO anon
  USING (true);

-- ----------------------------------------------------------------
-- Breaking news di prova (rimuovi o disattiva quando vuoi)
-- ----------------------------------------------------------------
INSERT INTO breaking_news (titolo, descrizione, url, attiva)
VALUES (
  '🚨 BREAKING: Salernitana ai Mondiali al posto dell''Italia',
  'Clamorosa decisione della FIFA: la Salernitana rappresenterà l''Italia ai prossimi Mondiali. La notizia ha sconvolto il mondo del calcio.',
  NULL,
  true
);
