CREATE OR REPLACE FUNCTION lunavo_guard_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entries is immutable; % operations are prohibited', TG_OP
    USING ERRCODE = '55000';
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.ledger_entries') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS ledger_entries_immutable_guard ON ledger_entries;
    CREATE TRIGGER ledger_entries_immutable_guard
    BEFORE UPDATE OR DELETE ON ledger_entries
    FOR EACH ROW EXECUTE FUNCTION lunavo_guard_ledger_mutation();
  END IF;
END;
$$;
