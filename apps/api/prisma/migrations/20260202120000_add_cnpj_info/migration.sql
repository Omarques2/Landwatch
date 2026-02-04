CREATE TABLE IF NOT EXISTS "app"."cnpj_info" (
    "cnpj" TEXT NOT NULL,
    "nome" TEXT,
    "fantasia" TEXT,
    "situacao" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    CONSTRAINT "cnpj_info_pkey" PRIMARY KEY ("cnpj")
);
