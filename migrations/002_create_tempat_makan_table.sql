-- Migration 002: Create tempat_makan table
-- Created: 2026-04-21

CREATE TABLE IF NOT EXISTS public.tempat_makan (
  id BIGSERIAL PRIMARY KEY,
  nama VARCHAR(255) NOT NULL,
  kategori VARCHAR(255),
  alamat TEXT,
  rating DECIMAL(2, 1),
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  url_gambar VARCHAR(500),
  create_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE INDEX IF NOT EXISTS idx_tempat_makan_kategori
  ON public.tempat_makan(kategori);

CREATE INDEX IF NOT EXISTS idx_tempat_makan_lat_lng
  ON public.tempat_makan(latitude, longitude);
