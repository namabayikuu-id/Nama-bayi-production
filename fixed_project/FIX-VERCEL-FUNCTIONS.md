# Error "File not found: api/[...path].js"

Nama file `[...path].js` memakai karakter `[` `]`.
Git/Vercel sering **gagal meng-upload file itu**, lalu build mencari file yang tidak ada.

Jangan pakai `[...path].js`. Pakai `api/index.js` (nama biasa).

## Isi folder api yang benar

Hanya 1 file:

```
api/index.js
lib/supabase.js
```

Hapus dari GitHub:

- api/[...path].js
- api/_supabase.js
- api/categories.js, photos.js, exports.js, quota.js, schedule.js
- api/ai/, api/cron/, api/photos/, api/exports/, api/tiktok/

## Git (wajib)

```bash
git rm -f --ignore-unmatch "api/[...path].js" api/_supabase.js
git add -A api/index.js lib/supabase.js vercel.json .vercelignore
git status
# api/ harus hanya index.js
git commit -m "fix: single api/index.js serverless function"
git push
```

Lalu Vercel Redeploy (tanpa cache).
