-- =====================================================================
-- 0050_lost_in_transit.sql
--
-- Gives "missing during a transfer" its own distinct, trackable identity
-- instead of folding it into the generic 'damage' bucket or the generic
-- 'count_variance' reason. Damage means the piece arrived broken; lost
-- in transit means it never arrived at all -- different operational
-- handling (courier claim vs write-off), and now different data.
--
-- Both enum values are added in their own statements/transactions on
-- purpose: Postgres will not let a freshly-added enum value be used in
-- the same transaction that added it.
-- =====================================================================

alter type stock_reason add value if not exists 'lost_in_transit' after 'count_variance';
