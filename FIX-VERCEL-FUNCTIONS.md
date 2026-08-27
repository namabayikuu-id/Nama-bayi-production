# Fix error 12 Serverless Functions (Hobby Plan)

Penyebab error: Vercel menghitung **setiap file `.js` di folder `api/`** sebagai 1 function.
Repo lama punya ~14 file endpoint → tembus limit 12.

## Struktur yang WAJIB dipakai

```
api/
  index.js          ← SATU-SATUNYA function
lib/
  supabase.js       ← helper (di LUAR /api, tidak dihitung)
.vercelignore       ← memblokir file endpoint lama meski masih ada di Git
vercel.json
```

Jangan ada `api/categories.js`, `api/photos.js`, `api/tiktok/*.js`, `api/[...path].js`, dll.

## Cara deploy yang benar (paling sering gagal di sini)

Error tetap muncul hampir selalu karena **file lama masih ada di GitHub**.
Menambah file baru TIDAK menghapus file lama.

1. Di repo GitHub / komputer lokal, **hapus seluruh isi lama folder `api/`** lalu ganti dengan ZIP ini.
2. Commit **penghapusan** (git status harus banyak `deleted: api/...`).
3. Push.
4. Vercel → Deployments → Redeploy → **matikan build cache**.

Atau di Vercel: **Settings → General → Root Directory** pastikan menunjuk ke folder yang berisi `api/index.js` (bukan subfolder lama).

## Cek setelah deploy

Tab **Functions** harus hanya: `api/index` (1 function).

Kalau masih banyak nama `api/photos`, `api/tiktok/post`, dst. — commit yang di-deploy masih yang lama.
