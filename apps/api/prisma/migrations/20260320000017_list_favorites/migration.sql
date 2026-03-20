-- CreateTable
CREATE TABLE "list_favorites" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "person_id" UUID NOT NULL,
    "list_id" UUID NOT NULL,
    "sort_order" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "list_favorites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "list_favorites_person_id_list_id_key" ON "list_favorites"("person_id", "list_id");

-- CreateIndex
CREATE INDEX "list_favorites_person_id_idx" ON "list_favorites"("person_id");

-- CreateIndex
CREATE INDEX "list_favorites_list_id_idx" ON "list_favorites"("list_id");

-- AddForeignKey
ALTER TABLE "list_favorites" ADD CONSTRAINT "list_favorites_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "list_favorites" ADD CONSTRAINT "list_favorites_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: list_favorites rows are visible/mutable only within the correct hive.
-- We join via lists to enforce hive isolation.
ALTER TABLE "list_favorites" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "list_favorites_hive_isolation" ON "list_favorites"
    USING (
        list_id IN (
            SELECT id FROM lists WHERE hive_id = current_setting('app.hive_id', TRUE)::uuid
        )
    );
