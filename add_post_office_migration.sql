-- Idempotent Migration: Add post_office column to customers table
ALTER TABLE customers ADD COLUMN IF NOT EXISTS post_office text;
