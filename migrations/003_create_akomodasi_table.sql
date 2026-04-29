-- Migration 003: Create akomodasi table
-- Created: 2026-04-25

CREATE TABLE IF NOT EXISTS public.akomodasi (
  id BIGSERIAL PRIMARY KEY,
  nama VARCHAR(255) NOT NULL,
  kategori VARCHAR(255),
  alamat TEXT,
  nomor_telepon VARCHAR(100),
  rating DECIMAL(2, 1),
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  url_gambar VARCHAR(500),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE INDEX IF NOT EXISTS idx_akomodasi_kategori
  ON public.akomodasi(kategori);

CREATE INDEX IF NOT EXISTS idx_akomodasi_lat_lng
  ON public.akomodasi(latitude, longitude);
