# 🚀 Deploy ke Vercel + Supabase

## Langkah 1 — Supabase Setup
1. Buka supabase.com → New project
2. Catat: Project URL + Service Role Key (Settings → API)
3. Buka SQL Editor → paste & jalankan `supabase-schema.sql`
4. Storage → Buat bucket "photos" (Public) dan "exports" (Public)

## Langkah 2 — GitHub
1. Buat repo baru di github.com
2. Push semua file: git init → git add . → git commit → git push

## Langkah 3 — Vercel Deploy
1. Buka vercel.com → New Project → Import dari GitHub
2. Framework: Vite
3. Build Command: npm run build
4. Output Directory: dist
5. Add Environment Variables:
   - SUPABASE_URL
   - SUPABASE_SERVICE_KEY
   - GROQ_API_KEY
   - CF_WORKER_URL
   - TIKTOK_CLIENT_KEY
   - TIKTOK_CLIENT_SECRET
   - APP_URL = https://nama-project.vercel.app (isi setelah deploy pertama)
   - CRON_SECRET = random string panjang
6. Deploy!

## Langkah 4 — Install npm dependencies baru
```bash
npm install @supabase/supabase-js
```

## URL Penting setelah deploy
- App: https://nama-project.vercel.app
- Privacy Policy: https://nama-project.vercel.app/privacy
- Terms of Service: https://nama-project.vercel.app/tos

## Daftarkan ke TikTok Developer
- Terms of Service URL: https://nama-project.vercel.app/tos
- Privacy Policy URL: https://nama-project.vercel.app/privacy
- Website URL: https://nama-project.vercel.app
- Redirect URI: https://nama-project.vercel.app/api/tiktok/callback

## Auto-delete foto 4 hari
Otomatis via Supabase pg_cron (sudah disetup di schema.sql)
Backup via Vercel Cron (/api/cron/cleanup jam 00:00 UTC)
