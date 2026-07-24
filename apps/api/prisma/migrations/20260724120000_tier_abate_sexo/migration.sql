-- tier: quebra por sexo, total derivado (drop qtd_animais)
ALTER TABLE app.tier
  ADD COLUMN qtd_macho integer NOT NULL DEFAULT 0,
  ADD COLUMN qtd_femea integer NOT NULL DEFAULT 0,
  ADD COLUMN qtd_indefinido integer NOT NULL DEFAULT 0;

UPDATE app.tier SET qtd_indefinido = qtd_animais;

ALTER TABLE app.tier DROP COLUMN qtd_animais;

ALTER TABLE app.tier
  ADD CONSTRAINT tier_qtd_sexo_nonneg
    CHECK (qtd_macho >= 0 AND qtd_femea >= 0 AND qtd_indefinido >= 0),
  ADD CONSTRAINT tier_qtd_sexo_total_min
    CHECK (qtd_macho + qtd_femea + qtd_indefinido >= 1);

-- tier_abate: idem
ALTER TABLE app.tier_abate
  ADD COLUMN qtd_macho integer NOT NULL DEFAULT 0,
  ADD COLUMN qtd_femea integer NOT NULL DEFAULT 0,
  ADD COLUMN qtd_indefinido integer NOT NULL DEFAULT 0;

UPDATE app.tier_abate SET qtd_indefinido = qtd;

ALTER TABLE app.tier_abate DROP COLUMN qtd;

ALTER TABLE app.tier_abate
  ADD CONSTRAINT tier_abate_qtd_sexo_nonneg
    CHECK (qtd_macho >= 0 AND qtd_femea >= 0 AND qtd_indefinido >= 0),
  ADD CONSTRAINT tier_abate_qtd_sexo_total_min
    CHECK (qtd_macho + qtd_femea + qtd_indefinido >= 1);
