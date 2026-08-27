# Fix: "No more than 12 Serverless Functions" (Hobby Plan)

## Apa yang diubah
Folder `api/` sekarang HANYA berisi 2 file:

```
api/
  [...path].js   ← 1 Serverless Function (catch-all untuk SEMUA route /api/*)
  _supabase.js   ← helper (awalan _ = TIDAK dihitung sebagai function)
```

Semua endpoint lama sudah digabung ke dalam `[...path].js`.

## Langkah wajib agar error hilang

### 1. Pastikan file lama sudah TERHAPUS di Git
Di komputer lokal / di repo GitHub, folder `api/` harus persis seperti di atas.
Jalankan di root project:

```bash
# Hapus sisa file endpoint lama (jika masih ada)
rm -f api/categories.js api/exports.js api/photos.js api/quota.js api/schedule.js api/index.js
rm -rf api/ai api/cron api/exports api/photos api/tiktok

# Pastikan hanya 2 file
ls -la api/
# Harus hanya: [...path].js  dan  _supabase.js
```

### 2. Commit & push SEMUA penghapusan
```bash
git add -A
git status   # cek: banyak file api/* berwarna merah (deleted)
git commit -m "fix: consolidate all API into single catch-all function"
git push
```

### 3. Redeploy di Vercel (dengan clear cache)
1. Buka Vercel Dashboard → project Anda
2. Tab **Deployments**
3. Klik **...** pada deployment terbaru → **Redeploy**
4. Centang **Use existing Build Cache** = **OFF** / clear cache
5. Deploy

### 4. Verifikasi
Setelah deploy sukses, buka tab **Functions** di project Vercel.
Harus hanya muncul **1 function**: `api/[...path]`

Jika masih >1, berarti file lama masih ada di source yang di-deploy
(cek tab Source / Git commit hash yang dipakai).
