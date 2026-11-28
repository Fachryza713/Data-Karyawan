-- CreateEnum
CREATE TYPE "kpi_period_status" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "kpi_review_status" AS ENUM ('DRAFT', 'FINAL');

-- CreateEnum
CREATE TYPE "kpi_grade" AS ENUM ('A', 'B', 'C', 'D');

-- CreateTable
CREATE TABLE "kpi_templates" (
    "id" UUID NOT NULL,
    "position_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kpi_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_indicators" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "weight" DECIMAL(5,2) NOT NULL,
    "target" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kpi_indicators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_periods" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "deadline" DATE NOT NULL,
    "status" "kpi_period_status" NOT NULL DEFAULT 'DRAFT',
    "activated_at" TIMESTAMPTZ(3),
    "closed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kpi_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_reviews" (
    "id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "reviewer_id" UUID,
    "position_id" UUID,
    "department_id" UUID,
    "template_id" UUID,
    "final_score" DECIMAL(5,2),
    "grade" "kpi_grade",
    "note" TEXT,
    "status" "kpi_review_status" NOT NULL DEFAULT 'DRAFT',
    "finalized_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kpi_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_scores" (
    "id" UUID NOT NULL,
    "review_id" UUID NOT NULL,
    "indicator_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "weight" DECIMAL(5,2) NOT NULL,
    "target" TEXT,
    "sort_order" INTEGER NOT NULL,
    "score" DECIMAL(5,2),
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kpi_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kpi_templates_position_id_idx" ON "kpi_templates"("position_id");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_templates_one_active_per_position" ON "kpi_templates"("position_id") WHERE (is_active);

-- CreateIndex
CREATE INDEX "kpi_indicators_template_id_sort_order_idx" ON "kpi_indicators"("template_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_periods_name_key" ON "kpi_periods"("name");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_periods_one_active" ON "kpi_periods"("status") WHERE (status = 'ACTIVE');

-- CreateIndex
CREATE INDEX "kpi_reviews_employee_id_idx" ON "kpi_reviews"("employee_id");

-- CreateIndex
CREATE INDEX "kpi_reviews_reviewer_id_idx" ON "kpi_reviews"("reviewer_id");

-- CreateIndex
CREATE INDEX "kpi_reviews_position_id_idx" ON "kpi_reviews"("position_id");

-- CreateIndex
CREATE INDEX "kpi_reviews_department_id_idx" ON "kpi_reviews"("department_id");

-- CreateIndex
CREATE INDEX "kpi_reviews_template_id_idx" ON "kpi_reviews"("template_id");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_reviews_period_id_employee_id_key" ON "kpi_reviews"("period_id", "employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_scores_review_id_indicator_id_key" ON "kpi_scores"("review_id", "indicator_id");

-- AddForeignKey
ALTER TABLE "kpi_templates" ADD CONSTRAINT "kpi_templates_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_indicators" ADD CONSTRAINT "kpi_indicators_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "kpi_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_reviews" ADD CONSTRAINT "kpi_reviews_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "kpi_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_reviews" ADD CONSTRAINT "kpi_reviews_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_reviews" ADD CONSTRAINT "kpi_reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_reviews" ADD CONSTRAINT "kpi_reviews_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_reviews" ADD CONSTRAINT "kpi_reviews_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_reviews" ADD CONSTRAINT "kpi_reviews_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "kpi_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_scores" ADD CONSTRAINT "kpi_scores_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "kpi_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- CHECK constraint (Prisma Schema belum bisa menuliskannya). Batas panjang
-- teks sama dengan DTO; bobot dan skor dibandingkan sebagai numeric.
-- ---------------------------------------------------------------------------
ALTER TABLE "kpi_templates"
  ADD CONSTRAINT "kpi_templates_name_check" CHECK (length(btrim("name")) BETWEEN 1 AND 120);

ALTER TABLE "kpi_indicators"
  ADD CONSTRAINT "kpi_indicators_name_check" CHECK (length(btrim("name")) BETWEEN 1 AND 120),
  ADD CONSTRAINT "kpi_indicators_description_check" CHECK ("description" IS NULL OR length("description") <= 500),
  ADD CONSTRAINT "kpi_indicators_target_check" CHECK ("target" IS NULL OR length("target") <= 120),
  ADD CONSTRAINT "kpi_indicators_weight_check" CHECK ("weight" > 0 AND "weight" <= 100),
  ADD CONSTRAINT "kpi_indicators_sort_order_check" CHECK ("sort_order" >= 0);

ALTER TABLE "kpi_periods"
  ADD CONSTRAINT "kpi_periods_name_check" CHECK (length(btrim("name")) BETWEEN 1 AND 50),
  ADD CONSTRAINT "kpi_periods_dates_check" CHECK ("end_date" >= "start_date" AND "deadline" >= "start_date"),
  -- activated_at terisi sejak ACTIVE, closed_at hanya saat CLOSED.
  ADD CONSTRAINT "kpi_periods_activated_check" CHECK (("status" = 'DRAFT') = ("activated_at" IS NULL)),
  ADD CONSTRAINT "kpi_periods_closed_check" CHECK (("status" = 'CLOSED') = ("closed_at" IS NOT NULL));

ALTER TABLE "kpi_reviews"
  ADD CONSTRAINT "kpi_reviews_final_score_check" CHECK ("final_score" IS NULL OR "final_score" BETWEEN 0 AND 100),
  ADD CONSTRAINT "kpi_reviews_note_check" CHECK ("note" IS NULL OR length("note") <= 1000),
  -- FINAL selalu punya nilai akhir, grade, dan waktu finalisasi; DRAFT tidak.
  ADD CONSTRAINT "kpi_reviews_final_check" CHECK (
    ("status" = 'FINAL') = ("final_score" IS NOT NULL AND "grade" IS NOT NULL AND "finalized_at" IS NOT NULL)
  ),
  ADD CONSTRAINT "kpi_reviews_final_reviewer_check" CHECK ("status" = 'DRAFT' OR "reviewer_id" IS NOT NULL);

ALTER TABLE "kpi_scores"
  ADD CONSTRAINT "kpi_scores_weight_check" CHECK ("weight" > 0 AND "weight" <= 100),
  ADD CONSTRAINT "kpi_scores_score_check" CHECK ("score" IS NULL OR "score" BETWEEN 0 AND 100),
  ADD CONSTRAINT "kpi_scores_note_check" CHECK ("note" IS NULL OR length("note") <= 500);
