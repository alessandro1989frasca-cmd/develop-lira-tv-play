-- Tabella per i push token delle notifiche urgenti
-- Esegui questo script in Supabase → SQL Editor

CREATE TABLE IF NOT EXISTS push_tokens (
  id SERIAL PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  platform TEXT,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can insert push tokens"
  ON push_tokens FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon can update push tokens"
  ON push_tokens FOR UPDATE TO anon USING (true);

CREATE POLICY "anon can select own token"
  ON push_tokens FOR SELECT TO anon USING (true);

-- Trigger per aggiornare updated_at automaticamente
CREATE OR REPLACE FUNCTION update_push_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER push_tokens_updated_at
  BEFORE UPDATE ON push_tokens
  FOR EACH ROW EXECUTE FUNCTION update_push_tokens_updated_at();
