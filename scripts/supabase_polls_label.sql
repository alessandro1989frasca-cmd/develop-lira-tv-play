-- Aggiunge la colonna 'label' alla tabella polls
-- Usata per personalizzare l'etichetta mostrata nell'app (es. "SONDAGGIO", "VOTO", "OPINIONE")
-- Default: 'SONDAGGIO' per compatibilità con i sondaggi già esistenti

ALTER TABLE polls
ADD COLUMN IF NOT EXISTS label text NOT NULL DEFAULT 'SONDAGGIO';
