-- Migration 001: Create kategori_wisata and objek_wisata tables
-- Created: 2026-04-16

-- Buat tabel kategori_wisata
CREATE TABLE IF NOT EXISTS public.kategori_wisata (
  id BIGSERIAL PRIMARY KEY,
  nama VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Buat tabel objek_wisata
CREATE TABLE IF NOT EXISTS public.objek_wisata (
  id BIGSERIAL PRIMARY KEY,
  nama_objek_wisata VARCHAR(255) NOT NULL,
  deskripsi TEXT,
  lokasi VARCHAR(255),
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  kategori VARCHAR(255),
  is_buka BOOLEAN DEFAULT TRUE,
  tiket_masuk DECIMAL(10, 2),
  is_parkir BOOLEAN DEFAULT FALSE,
  jam_operasional VARCHAR(255),
  fasilitas TEXT,
  url_foto VARCHAR(500),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Create indexes untuk performa query
CREATE INDEX IF NOT EXISTS idx_kategori_wisata_nama ON public.kategori_wisata(nama);
CREATE INDEX IF NOT EXISTS idx_objek_wisata_kategori ON public.objek_wisata(kategori);

-- Insert kategori dari data existing
INSERT INTO public.kategori_wisata (nama) VALUES
  ('taman bunga'),
  ('viewpoint'),
  ('bukit'),
  ('gunung'),
  ('danau'),
  ('taman')
ON CONFLICT (nama) DO NOTHING;
