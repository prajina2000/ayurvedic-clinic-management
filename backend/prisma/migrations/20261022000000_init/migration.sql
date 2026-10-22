CREATE TABLE IF NOT EXISTS "clinic_documents" (
  "collection_name" TEXT NOT NULL,
  "document_id" TEXT NOT NULL,
  "data" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clinic_documents_pkey" PRIMARY KEY ("collection_name", "document_id"),
  CONSTRAINT "clinic_documents_collection_name_check" CHECK ("collection_name" IN (
    'audit_log', 'consultation_bills', 'counters', 'departments', 'doctor_profiles', 'expenses',
    'icd_codes', 'medicine_batches', 'medicine_master', 'patients', 'pharmacy_bills',
    'pharmacy_suppliers', 'prescription_items', 'prescriptions', 'procedure_bills',
    'procedure_catalog', 'procedure_plans', 'procedure_sessions', 'purchases', 'queue_tokens',
    'users', 'visits', 'whatsapp_sessions'
  ))
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'clinic_documents_collection_name_check'
      AND conrelid = 'clinic_documents'::regclass
  ) THEN
    ALTER TABLE "clinic_documents"
      ADD CONSTRAINT "clinic_documents_collection_name_check" CHECK ("collection_name" IN (
        'audit_log', 'consultation_bills', 'counters', 'departments', 'doctor_profiles', 'expenses',
        'icd_codes', 'medicine_batches', 'medicine_master', 'patients', 'pharmacy_bills',
        'pharmacy_suppliers', 'prescription_items', 'prescriptions', 'procedure_bills',
        'procedure_catalog', 'procedure_plans', 'procedure_sessions', 'purchases', 'queue_tokens',
        'users', 'visits', 'whatsapp_sessions'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "clinic_documents_collection_created_idx"
  ON "clinic_documents" ("collection_name", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "clinic_documents_data_gin_idx"
  ON "clinic_documents" USING GIN ("data" jsonb_path_ops);
