-- =====================================================================
-- Supabase: aggiunge supporto widget risultati Salernitana a app_config
-- Esegui questo script nell'editor SQL di Supabase
-- =====================================================================

ALTER TABLE app_config
  ADD COLUMN IF NOT EXISTS match_widget_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS match_data jsonb DEFAULT NULL;

-- Verifica
SELECT id, match_widget_enabled, match_data FROM app_config ORDER BY id;
