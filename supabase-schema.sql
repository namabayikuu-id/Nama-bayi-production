-- ─────────────────────────────────────────────────────────────────────────────
-- Baby Name Creator — Supabase Schema
-- Jalankan ini di Supabase SQL Editor (sekali saja)
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable pg_cron extension untuk auto-delete
create extension if not exists pg_cron;

-- ── Tabel kategori foto ───────────────────────────────────────────────────────
create table if not exists categories (
  id           text primary key,
  label        text not null,
  emoji        text default '🍼',
  prompt_male  text,
  prompt_female text,
  created_at   timestamptz default now()
);

-- ── Tabel foto ────────────────────────────────────────────────────────────────
create table if not exists photos (
  id           uuid primary key default gen_random_uuid(),
  category_id  text references categories(id) on delete cascade,
  gender       text not null check (gender in ('laki-laki','perempuan')),
  filename     text not null,
  storage_path text not null,  -- path di Supabase Storage
  url          text not null,  -- public URL
  created_at   timestamptz default now(),
  expires_at   timestamptz default now() + interval '4 days'
);

create index if not exists photos_category_gender on photos(category_id, gender);
create index if not exists photos_expires on photos(expires_at);

-- ── Tabel exports (antrian TikTok) ───────────────────────────────────────────
create table if not exists exports (
  id           text primary key,  -- timestamp string
  theme        text,
  category_id  text,
  frame_count  int default 12,
  labels       jsonb,             -- ['hook','name1',...,'cta']
  names        jsonb,             -- array nama
  pending      boolean default true,
  created_at   timestamptz default now()
);

-- ── Tabel frame export ────────────────────────────────────────────────────────
create table if not exists export_frames (
  id           uuid primary key default gen_random_uuid(),
  export_id    text references exports(id) on delete cascade,
  filename     text,
  storage_path text,
  url          text,
  sort_order   int
);

create index if not exists frames_export on export_frames(export_id, sort_order);

-- ── Config jadwal & TikTok (1 baris saja) ────────────────────────────────────
create table if not exists schedule_config (
  id                    int primary key default 1,
  enabled               boolean default false,  -- DISABLED sambil nunggu TikTok approval
  hour                  int default 15,
  minute                int default 0,
  caption               text default 'Nama bayi islami yang indah ✨ #namabayi #namabayiislami',
  tiktok_access_token   text,
  tiktok_refresh_token  text,
  tiktok_username       text,
  tiktok_expires_at     bigint,
  tiktok_open_id        text,
  app_url               text,
  last_post             jsonb,
  pending_exports       text[] default '{}',
  updated_at            timestamptz default now()
);
insert into schedule_config (id) values (1) on conflict (id) do nothing;

-- ── Quota Cloudflare (reset harian) ──────────────────────────────────────────
create table if not exists quota (
  id           int primary key default 1,
  date         date default current_date,
  used_neurons int default 0
);
insert into quota (id) values (1) on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- Auto-delete foto setelah 4 hari (pg_cron, jalan tiap jam 00:00 UTC)
-- ─────────────────────────────────────────────────────────────────────────────
select cron.schedule(
  'delete-expired-photos',
  '0 0 * * *',
  $$
    -- Hapus dari tabel (storage path disimpan untuk cleanup)
    delete from photos where expires_at < now();
    -- Reset quota kalau sudah ganti hari
    update quota set used_neurons = 0, date = current_date
      where date < current_date;
  $$
);

-- ── Row Level Security (buka akses untuk service role key) ───────────────────
alter table categories     enable row level security;
alter table photos         enable row level security;
alter table exports        enable row level security;
alter table export_frames  enable row level security;
alter table schedule_config enable row level security;
alter table quota          enable row level security;

-- Policy: service role bisa akses semua (dipakai dari Vercel API)
create policy "service_all" on categories     for all using (true);
create policy "service_all" on photos         for all using (true);
create policy "service_all" on exports        for all using (true);
create policy "service_all" on export_frames  for all using (true);
create policy "service_all" on schedule_config for all using (true);
create policy "service_all" on quota          for all using (true);

-- ── Storage buckets ───────────────────────────────────────────────────────────
-- Jalankan di SQL Editor atau buat manual di Storage tab:
-- Bucket "photos" → Public
-- Bucket "exports" → Public
insert into storage.buckets (id, name, public) values ('photos',  'photos',  true) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('exports', 'exports', true) on conflict do nothing;

-- Policy storage: public read, service write
create policy "public_read_photos"   on storage.objects for select using (bucket_id = 'photos');
create policy "service_write_photos" on storage.objects for insert with check (bucket_id = 'photos');
create policy "service_delete_photos" on storage.objects for delete using (bucket_id = 'photos');
create policy "public_read_exports"  on storage.objects for select using (bucket_id = 'exports');
create policy "service_write_exports" on storage.objects for insert with check (bucket_id = 'exports');
