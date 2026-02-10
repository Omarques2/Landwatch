-- Add analysis_docs JSONB and drop legacy cpf_cnpj
ALTER TABLE "app"."analysis" ADD COLUMN "analysis_docs" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "app"."analysis" DROP COLUMN "cpf_cnpj";
