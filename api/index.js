/**
 * SATU-SATUNYA Serverless Function untuk Vercel Hobby Plan.
 * Semua request /api/* di-rewrite ke file ini (lihat vercel.json).
 * Jangan tambah file .js lain di folder /api — tiap file = 1 function.
 */
import {
  supabase,
  getQuota,
  addQuotaUsage,
  NEURONS_PER_IMAGE,
  DAILY_BUDGET,
} from '../lib/supabase.js'

// ── Path helpers ─────────────────────────────────────────────────────────────
function stripQuery(s) {
  return String(s || '').split('?')[0]
}

function normalizeApiPath(input) {
  if (!input) return ''
  let path = stripQuery(input)
  try { path = decodeURIComponent(path) } catch {}
  if (/^https?:\/\//i.test(path)) {
    try { path = new URL(path).pathname } catch {}
  }
  // After rewrite, destination is /api/index — ignore that
  if (path === '/api/index' || path === '/api/index.js' || path === '/api') return ''
  if (path.startsWith('/api/index/')) path = path.slice('/api/index'.length)
  else if (path.startsWith('/api/')) path = path.slice(4)
  else if (path === '/ai/chat' || path.startsWith('/ai/chat')) path = '/ai/chat'
  if (!path.startsWith('/')) path = '/' + path
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1)
  if (path === '/index' || path === '/index.js') return ''
  return path
}

function getPath(req) {
  const h = req.headers || {}
  const candidates = [
    h['x-forwarded-uri'],
    h['x-invoke-path'],
    h['x-matched-path'],
    h['x-vercel-original-path'],
    h['x-real-url'],
    req.originalUrl,
    req.url,
  ]
  for (const c of candidates) {
    const p = normalizeApiPath(c)
    if (p && p !== '/') return p
  }
  const q = req.query || {}
  if (q.path !== undefined) {
    const segs = Array.isArray(q.path) ? q.path : [q.path]
    const p = normalizeApiPath('/' + segs.filter(Boolean).join('/'))
    if (p && p !== '/') return p
  }
  if (q.__path) {
    const raw = Array.isArray(q.__path) ? q.__path[0] : q.__path
    const p = normalizeApiPath('/' + raw)
    if (p && p !== '/') return p
  }
  return '/'
}

// ── Main router ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // CORS preflight (optional, harmless)
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    return res.status(204).end()
  }

  const path = getPath(req)
  const method = req.method

  try {
    // ── Categories ─────────────────────────────────────────────────────────
    if (path === '/categories') {
      return await handleCategories(req, res, method)
    }

    // ── Photos ─────────────────────────────────────────────────────────────
    if (path === '/photos') {
      return await handlePhotosList(req, res, method)
    }
    if (path === '/photos/generate') {
      return await handlePhotosGenerate(req, res, method)
    }
    if (path === '/photos/delete') {
      return await handlePhotosDelete(req, res, method)
    }
    if (path === '/photos/save') {
      return await handlePhotosSave(req, res, method)
    }

    // ── Quota ──────────────────────────────────────────────────────────────
    if (path === '/quota') {
      return await handleQuota(req, res, method)
    }

    // ── Schedule ───────────────────────────────────────────────────────────
    if (path === '/schedule') {
      return await handleSchedule(req, res, method)
    }

    // ── Exports ────────────────────────────────────────────────────────────
    if (path === '/exports') {
      return await handleExports(req, res, method)
    }
    if (path === '/exports/save') {
      return await handleExportsSave(req, res, method)
    }
    if (path === '/exports/delete') {
      // Frontend calls DELETE /api/exports/delete with { id }
      return await handleExportsDelete(req, res, method)
    }

    // ── AI / Groq ──────────────────────────────────────────────────────────
    if (path === '/ai/chat' || path === '/chat') {
      return await handleAiChat(req, res, method)
    }

    // ── TikTok ─────────────────────────────────────────────────────────────
    if (path === '/tiktok/authurl') {
      return await handleTiktokAuthUrl(req, res, method)
    }
    if (path === '/tiktok/callback') {
      return await handleTiktokCallback(req, res, method)
    }
    if (path === '/tiktok/disconnect') {
      return await handleTiktokDisconnect(req, res, method)
    }
    if (path === '/tiktok/post') {
      return await handleTiktokPost(req, res, method)
    }

    // ── Cron ───────────────────────────────────────────────────────────────
    if (path === '/cron/cleanup') {
      return await handleCronCleanup(req, res, method)
    }
    if (path === '/cron/photos') {
      return await handleCronPhotos(req, res, method)
    }

    if (path === '/api/packages' || path === '/packages') {
      return await handlePackages(req, res, method)
    }
    if (path === '/api/cron/generate' || path === '/cron/generate') {
      return await handleCronGenerate(req, res, method)
    }

    return res.status(404).json({ error: `Not found: ${method} ${path}` })
  } catch (e) {
    console.error('[api]', path, e)
    return res.status(500).json({ error: e.message || 'Internal error' })
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Handlers
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_CATEGORIES = [
  {
    id: 'bayi-islami',
    label: 'Bayi Islami',
    emoji: '🕌',
    prompt_male:
      'Professional portrait photo of a cute healthy chubby baby boy, wearing white thobe, Muslim Islamic style, warm golden lighting, sitting upright, upper body visible, chubby cheeks bright eyes, bokeh background, sharp focus, high quality DSLR',
    prompt_female:
      'Professional portrait photo of a cute healthy chubby baby girl, wearing white hijab pastel outfit, Muslim Islamic style, warm golden lighting, sitting upright, upper body visible, chubby cheeks bright eyes, bokeh background, sharp focus, high quality DSLR',
  },
  {
    id: 'bayi-eropa',
    label: 'Bayi Eropa',
    emoji: '🌿',
    prompt_male:
      'Professional portrait photo of a cute healthy chubby European baby boy, blonde hair blue eyes, wearing soft white shirt, bright natural daylight, sitting upright, upper body visible, chubby cheeks, bokeh background, sharp focus, high quality DSLR',
    prompt_female:
      'Professional portrait photo of a cute healthy chubby European baby girl, blonde hair blue eyes, wearing soft white floral dress, bright natural daylight, sitting upright, upper body visible, chubby cheeks, bokeh background, sharp focus, high quality DSLR',
  },
]

async function handleCategories(req, res, method) {
  if (method === 'GET') {
    let { data } = await supabase.from('categories').select('*').order('created_at')
    if (!data?.length) {
      await supabase.from('categories').upsert(DEFAULT_CATEGORIES)
      data = DEFAULT_CATEGORIES
    }
    return res.json(
      data.map((c) => ({
        id: c.id,
        label: c.label,
        emoji: c.emoji,
        promptMale: c.prompt_male,
        promptFemale: c.prompt_female,
      }))
    )
  }

  if (method === 'POST') {
    const { id, label, emoji, promptMale, promptFemale } = req.body || {}
    await supabase.from('categories').upsert({
      id,
      label,
      emoji,
      prompt_male: promptMale,
      prompt_female: promptFemale,
    })
    return res.json({ ok: true })
  }

  if (method === 'DELETE') {
    const { id } = req.body || {}
    const { data: photos } = await supabase
      .from('photos')
      .select('storage_path')
      .eq('category_id', id)
    if (photos?.length) {
      await supabase.storage.from('photos').remove(photos.map((p) => p.storage_path))
    }
    await supabase.from('categories').delete().eq('id', id)
    return res.json({ ok: true })
  }

  return res.status(405).end()
}

async function handlePhotosList(req, res, method) {
  if (method !== 'GET') return res.status(405).end()
  const { data: cats } = await supabase.from('categories').select('id')
  const result = {}
  for (const cat of cats || []) {
    const { data: photos } = await supabase
      .from('photos')
      .select('id,filename,url,gender,created_at')
      .eq('category_id', cat.id)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
    result[cat.id] = {
      'laki-laki': (photos || [])
        .filter((p) => p.gender === 'laki-laki')
        .map((p) => ({ ...p, mtime: new Date(p.created_at).getTime() })),
      perempuan: (photos || [])
        .filter((p) => p.gender === 'perempuan')
        .map((p) => ({ ...p, mtime: new Date(p.created_at).getTime() })),
    }
  }
  return res.json(result)
}

async function handlePhotosGenerate(req, res, method) {
  if (method !== 'POST') return res.status(405).end()
  const { prompt, category, gender, seed } = req.body || {}

  // Cek quota dulu
  const q = await getQuota()
  if (q.used_neurons + NEURONS_PER_IMAGE > DAILY_BUDGET) {
    return res.status(429).json({ error: 'QUOTA_EXCEEDED: Budget neuron harian habis. Reset 00:00 UTC.' })
  }

  const cfUrl = process.env.CF_WORKER_URL
  if (!cfUrl) return res.status(500).json({ error: 'CF_WORKER_URL belum diset' })

  // Kembalikan info ke browser — BROWSER yang fetch CF Worker langsung
  // Ini menghindari Vercel 504 timeout (batas 10 detik)
  return res.json({
    cfUrl,
    prompt,
    category,
    gender,
    seed,
    quota: { used: q.used_neurons, budget: DAILY_BUDGET,
      remaining: DAILY_BUDGET - q.used_neurons,
      neuronsPerImage: NEURONS_PER_IMAGE,
      estimatedPhotosLeft: Math.floor((DAILY_BUDGET - q.used_neurons) / NEURONS_PER_IMAGE) }
  })
}

// Browser fetch CF Worker → dapat gambar → kirim base64 ke sini → upload Supabase
async function handlePhotosSave(req, res, method) {
  if (method !== 'POST') return res.status(405).end()
  const { base64, category, gender, seed } = req.body || {}
  if (!base64 || !category || !gender) {
    return res.status(400).json({ error: 'base64, category, gender wajib' })
  }
  try {
    const buf = Buffer.from(base64, 'base64')
    if (buf.length < 1000) throw new Error('Gambar terlalu kecil')
    const filename = `${Date.now()}_${seed || Math.floor(Math.random() * 99999)}.jpg`
    const storagePath = `${category}/${gender}/${filename}`
    const { error: upErr } = await supabase.storage
      .from('photos').upload(storagePath, buf, { contentType: 'image/jpeg', upsert: false })
    if (upErr) throw new Error('Upload storage: ' + upErr.message)
    const { data: { publicUrl } } = supabase.storage.from('photos').getPublicUrl(storagePath)
    const expiresAt = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString()
    await supabase.from('photos').insert({
      category_id: category, gender, filename,
      storage_path: storagePath, url: publicUrl, expires_at: expiresAt,
    })
    // Catat quota setelah berhasil simpan
    const quota = await addQuotaUsage(NEURONS_PER_IMAGE)
    console.log('[api] ✅ Photo saved:', storagePath, '| Quota:', quota.used + '/' + quota.budget)
    return res.json({ url: publicUrl, filename, quota, ok: true })
  } catch (e) {
    console.error('[api] photos/save error:', e.message)
    return res.status(500).json({ error: e.message })
  }
}

async function handlePhotosDelete(req, res, method) {
  if (method !== 'DELETE') return res.status(405).end()
  const { category, gender, filename } = req.body || {}
  const storagePath = `${category}/${gender}/${filename}`
  await supabase.storage.from('photos').remove([storagePath])
  await supabase.from('photos').delete().eq('storage_path', storagePath)
  return res.json({ ok: true })
}

async function handleQuota(req, res, method) {
  if (method !== 'GET') return res.status(405).end()
  const q = await getQuota()
  const remaining = Math.max(0, DAILY_BUDGET - q.used_neurons)
  return res.json({
    used: q.used_neurons,
    budget: DAILY_BUDGET,
    remaining,
    neuronsPerImage: NEURONS_PER_IMAGE,
    estimatedPhotosLeft: Math.floor(remaining / NEURONS_PER_IMAGE),
    date: q.date,
  })
}

async function handleSchedule(req, res, method) {
  if (method === 'GET') {
    const { data } = await supabase.from('schedule_config').select('*').eq('id', 1).single()
    if (!data) return res.json({ enabled: false, hour: 15, minute: 0, tiktok: {} })
    return res.json({
      enabled: data.enabled,
      hour: data.hour,
      minute: data.minute,
      caption: data.caption,
      appUrl: data.app_url,
      pendingExports: data.pending_exports || [],
      lastPost: data.last_post,
      tiktok: data.tiktok_access_token
        ? {
            accessToken: data.tiktok_access_token,
            refreshToken: data.tiktok_refresh_token,
            username: data.tiktok_username,
            openId: data.tiktok_open_id,
            expiresAt: data.tiktok_expires_at,
          }
        : null,
    })
  }

  if (method === 'POST') {
    const body = req.body || {}
    const update = { updated_at: new Date().toISOString() }
    if (body.enabled !== undefined) update.enabled = body.enabled
    if (body.hour !== undefined) update.hour = body.hour
    if (body.minute !== undefined) update.minute = body.minute
    if (body.caption !== undefined) update.caption = body.caption
    if (body.appUrl !== undefined) update.app_url = body.appUrl
    if (body.tiktok) {
      update.tiktok_access_token = body.tiktok.accessToken
      update.tiktok_refresh_token = body.tiktok.refreshToken
      update.tiktok_username = body.tiktok.username
      update.tiktok_open_id = body.tiktok.openId
      update.tiktok_expires_at = body.tiktok.expiresAt
    }
    await supabase.from('schedule_config').update(update).eq('id', 1)
    return res.json({ ok: true })
  }

  return res.status(405).end()
}

async function handleExports(req, res, method) {
  if (method === 'GET') {
    const { data: cfg } = await supabase
      .from('schedule_config')
      .select('pending_exports')
      .eq('id', 1)
      .single()
    const pending = cfg?.pending_exports || []
    const { data: exports_ } = await supabase
      .from('exports')
      .select('id,theme,frame_count,labels,pending,created_at')
      .order('created_at', { ascending: false })
      .limit(20)
    const result = await Promise.all(
      (exports_ || []).map(async (ex) => {
        const { data: frames } = await supabase
          .from('export_frames')
          .select('filename,url,sort_order')
          .eq('export_id', ex.id)
          .order('sort_order')
        return { ...ex, files: frames || [], pending: pending.includes(ex.id) }
      })
    )
    return res.json(result)
  }

  if (method === 'DELETE') {
    return handleExportsDelete(req, res, method)
  }

  return res.status(405).end()
}

async function handleExportsDelete(req, res, method) {
  if (method !== 'DELETE' && method !== 'POST') return res.status(405).end()
  const { id } = req.body || {}
  if (!id) return res.status(400).json({ error: 'id wajib' })

  const { data: frames } = await supabase
    .from('export_frames')
    .select('storage_path')
    .eq('export_id', id)
  if (frames?.length) {
    await supabase.storage.from('exports').remove(frames.map((f) => f.storage_path))
  }
  await supabase.from('exports').delete().eq('id', id)
  const { data: cfg } = await supabase
    .from('schedule_config')
    .select('pending_exports')
    .eq('id', 1)
    .single()
  const pending = (cfg?.pending_exports || []).filter((e) => e !== id)
  await supabase.from('schedule_config').update({ pending_exports: pending }).eq('id', 1)
  return res.json({ ok: true })
}

async function handleExportsSave(req, res, method) {
  if (method !== 'POST') return res.status(405).end()
  const { frames, meta } = req.body || {}
  const id = Date.now().toString()

  const frameRows = []
  for (let i = 0; i < (frames || []).length; i++) {
    const buf = Buffer.from(frames[i], 'base64')
    const filename =
      String(i).padStart(2, '0') + '_' + (meta?.labels?.[i] || 'frame') + '.jpg'
    const storagePath = `${id}/${filename}`
    await supabase.storage
      .from('exports')
      .upload(storagePath, buf, { contentType: 'image/jpeg' })
    const {
      data: { publicUrl },
    } = supabase.storage.from('exports').getPublicUrl(storagePath)
    frameRows.push({
      export_id: id,
      filename,
      storage_path: storagePath,
      url: publicUrl,
      sort_order: i,
    })
  }

  await supabase.from('exports').insert({
    id,
    theme: meta?.theme,
    category_id: meta?.category,
    frame_count: frames.length,
    labels: meta?.labels,
    names: meta?.names,
    pending: true,
  })
  await supabase.from('export_frames').insert(frameRows)

  const { data: cfg } = await supabase
    .from('schedule_config')
    .select('pending_exports')
    .eq('id', 1)
    .single()
  const pending = [...(cfg?.pending_exports || []), id]
  await supabase.from('schedule_config').update({ pending_exports: pending }).eq('id', 1)

  console.log('[api] Export saved:', id, frames.length, 'frames')
  return res.json({ ok: true, id })
}

// Model fallback list — coba satu per satu
const GROQ_MODELS = [
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'qwen/qwen3.6-27b',
]

async function callGroq(prompt) {
  const key = process.env.GROQ_API_KEY
  for (const model of GROQ_MODELS) {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'Respond ONLY with valid JSON, no explanation, no markdown.' },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.85,
      }),
    })
    const d = await r.json()
    if (r.ok && !d.error) {
      console.log('[groq] OK:', model)
      return d.choices?.[0]?.message?.content || ''
    }
    console.log('[groq] Skip', model + ':', d.error?.message?.slice(0, 80))
  }
  throw new Error('Semua model Groq gagal. Cek GROQ_API_KEY di Vercel env.')
}

async function handleAiChat(req, res, method) {
  if (method !== 'POST') return res.status(405).end()
  const { prompt } = req.body || {}
  if (!prompt) return res.status(400).json({ error: 'prompt required' })
  try {
    const text = await callGroq(prompt)
    return res.json({ text })
  } catch(e) {
    return res.status(500).json({ error: e.message })
  }
}

async function handleTiktokAuthUrl(req, res, method) {
  if (method !== 'GET') return res.status(405).end()
  const ck = process.env.TIKTOK_CLIENT_KEY
  if (!ck) return res.status(500).json({ error: 'TIKTOK_CLIENT_KEY belum diset' })
  const appUrl = process.env.APP_URL || `https://${req.headers.host}`
  const params = new URLSearchParams({
    client_key: ck,
    response_type: 'code',
    scope: 'user.info.basic,video.publish',
    redirect_uri: appUrl + '/api/tiktok/callback',
    state: Math.random().toString(36).slice(2),
  })
  return res.json({
    authUrl: 'https://www.tiktok.com/v2/auth/authorize/?' + params,
  })
}

async function handleTiktokCallback(req, res, method) {
  const code = req.query?.code
  if (!code) return res.status(400).send('Missing code')
  const appUrl = process.env.APP_URL || `https://${req.headers.host}`
  try {
    const form = new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY,
      client_secret: process.env.TIKTOK_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: appUrl + '/api/tiktok/callback',
    })
    const td = await (
      await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form,
      })
    ).json()
    if (!td.access_token) throw new Error(JSON.stringify(td))
    const ud = await (
      await fetch('https://open.tiktokapis.com/v2/user/info/?fields=display_name', {
        headers: { Authorization: 'Bearer ' + td.access_token },
      })
    ).json()
    const username = ud.data?.user?.display_name || 'Unknown'
    await supabase
      .from('schedule_config')
      .update({
        tiktok_access_token: td.access_token,
        tiktok_refresh_token: td.refresh_token,
        tiktok_open_id: td.open_id,
        tiktok_expires_at: Date.now() + td.expires_in * 1000,
        tiktok_username: username,
        app_url: appUrl,
      })
      .eq('id', 1)
    console.log('[tiktok] Connected:', username)
    res.redirect(appUrl + '/?tiktok=connected')
  } catch (e) {
    res.status(500).send('TikTok error: ' + e.message)
  }
}

async function handleTiktokDisconnect(req, res, method) {
  if (method !== 'POST' && method !== 'GET') return res.status(405).end()
  await supabase
    .from('schedule_config')
    .update({
      tiktok_access_token: null,
      tiktok_refresh_token: null,
      tiktok_open_id: null,
      tiktok_username: null,
      tiktok_expires_at: null,
    })
    .eq('id', 1)
  return res.json({ ok: true })
}

async function handleTiktokPost(req, res, method) {
  if (method !== 'POST') return res.status(405).end()
  const { data: cfg } = await supabase
    .from('schedule_config')
    .select('*')
    .eq('id', 1)
    .single()

  if (!cfg?.enabled) {
    return res.status(403).json({
      error: 'TikTok posting belum diaktifkan — menunggu approval TikTok Developer.',
    })
  }

  if (!cfg.tiktok_access_token) return res.status(400).json({ error: 'Belum login TikTok' })
  if (!cfg.pending_exports?.length)
    return res.status(400).json({ error: 'Tidak ada konten di antrian' })

  const exportId = cfg.pending_exports[0]
  const { data: frames } = await supabase
    .from('export_frames')
    .select('url')
    .eq('export_id', exportId)
    .order('sort_order')
  if (!frames?.length) return res.status(404).json({ error: 'Frame tidak ditemukan' })

  const photoUrls = frames.map((f) => f.url)
  const r = await fetch('https://open.tiktokapis.com/v2/post/publish/content/init/', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + cfg.tiktok_access_token,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({
      post_info: {
        title: cfg.caption,
        privacy_level: 'SELF_ONLY',
        disable_comment: false,
        auto_add_music: true,
      },
      source_info: {
        source: 'PULL_FROM_URL',
        photo_images: photoUrls,
        photo_cover_index: 0,
      },
      post_mode: 'DIRECT_POST',
      media_type: 'PHOTO',
    }),
  })
  const result = await r.json()
  console.log('[tiktok] post result:', JSON.stringify(result))

  if (result.error?.code === 'ok' || result.data?.publish_id) {
    const pending = cfg.pending_exports.filter((e) => e !== exportId)
    await supabase
      .from('schedule_config')
      .update({
        pending_exports: pending,
        last_post: {
          time: new Date().toISOString(),
          exportId,
          publishId: result.data?.publish_id,
        },
      })
      .eq('id', 1)
    await supabase.from('exports').update({ pending: false }).eq('id', exportId)
  }
  return res.json(result)
}

async function handleCronCleanup(req, res, method) {
  // Vercel Cron auth
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end()
  }

  const { data: expired } = await supabase
    .from('photos')
    .select('storage_path')
    .lt('expires_at', new Date().toISOString())

  if (expired?.length) {
    await supabase.storage.from('photos').remove(expired.map((p) => p.storage_path))
    await supabase.from('photos').delete().lt('expires_at', new Date().toISOString())
    console.log(`[cron] Deleted ${expired.length} expired photos`)
  }

  await supabase
    .from('quota')
    .update({ used_neurons: 0, date: new Date().toISOString().slice(0, 10) })
    .lt('date', new Date().toISOString().slice(0, 10))

  return res.json({ ok: true, deleted: expired?.length || 0 })
}

// ── PACKAGES + CRON GENERATE — appended ──────────────────────────────────────
// These are handled via the router above by adding new path checks
// The functions are defined here:

async function handlePackages(req, res, method) {
  if (method === 'GET') {
    const { data } = await supabase.from('content_packages')
      .select('*').order('created_at', { ascending: false }).limit(50)
    return res.json(data || [])
  }
  if (method === 'POST') {
    const { theme, emoji, category_id, hook, cta, names, photo_urls } = req.body || {}
    if (!names?.length) return res.status(400).json({ error: 'names kosong' })
    const id = Date.now().toString()
    const { error } = await supabase.from('content_packages').insert({
      id, category_id: category_id || null, theme: theme || 'Manual',
      emoji: emoji || '🍼', hook, cta, names, photo_urls,
      status: 'ready', auto_generated: false,
    })
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ ok: true, id })
  }
  if (method === 'DELETE') {
    const { id } = req.body || {}
    await supabase.from('content_packages').delete().eq('id', id)
    return res.json({ ok: true })
  }
  return res.status(405).end()
}

// ── Generate 1 foto langsung dari server (dipakai cron, tanpa lewat browser) ──
async function generatePhotoServerSide(categoryId, gender, prompt, seed) {
  const cfUrl = process.env.CF_WORKER_URL
  if (!cfUrl) throw new Error('CF_WORKER_URL belum diset')

  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 60000)
  let cfRes
  try {
    cfRes = await fetch(cfUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, seed }), signal: ctrl.signal,
    })
  } finally { clearTimeout(t) }
  if (!cfRes.ok) throw new Error('Cloudflare Worker HTTP ' + cfRes.status)

  const buf = Buffer.from(await cfRes.arrayBuffer())
  if (buf.length < 5000) throw new Error('Gambar terlalu kecil / gagal generate')

  const filename = `${Date.now()}_${seed}.jpg`
  const storagePath = `${categoryId}/${gender}/${filename}`
  const { error: upErr } = await supabase.storage.from('photos')
    .upload(storagePath, buf, { contentType: 'image/jpeg', upsert: false })
  if (upErr) throw new Error('Upload storage: ' + upErr.message)

  const { data: { publicUrl } } = supabase.storage.from('photos').getPublicUrl(storagePath)
  const expiresAt = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString()
  await supabase.from('photos').insert({
    category_id: categoryId, gender, filename, storage_path: storagePath, url: publicUrl, expires_at: expiresAt,
  })
  await addQuotaUsage(NEURONS_PER_IMAGE)
  return publicUrl
}

// ── AI menciptakan 1 tema/folder baru yang belum pernah ada ───────────────────
async function spawnNewCategory(existingLabels) {
  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.GROQ_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b',
      messages: [
        { role: 'system', content: 'Respond ONLY with valid JSON.' },
        { role: 'user', content: `Kamu membuat folder tema baru untuk konten TikTok foto & nama bayi. Tema yang SUDAH ADA: ${existingLabels.join(', ') || '(belum ada)'}.
Ciptakan SATU tema folder baru yang BERBEDA dari semua tema di atas — bisa budaya/negara lain (misal Jepang, Korea, India, Skandinavia), atau gaya visual (vintage, modern minimalis, klasik kerajaan, dsb).
Balas HANYA JSON:
{"id":"slug-singkat-tanpa-spasi","label":"Nama Tema","emoji":"🌸","prompt_male":"prompt foto AI (Bahasa Inggris) untuk bayi laki-laki bertema ini, gaya visual detail, foto potret profesional","prompt_female":"prompt foto AI (Bahasa Inggris) untuk bayi perempuan bertema ini, gaya visual detail, foto potret profesional"}` },
      ],
      response_format: { type: 'json_object' }, temperature: 1.0,
    }),
  })
  const gd = await groqRes.json()
  const idea = JSON.parse((gd.choices?.[0]?.message?.content || '{}').match(/\{[\s\S]*\}/)[0])
  if (!idea.id || !idea.label || !idea.prompt_male || !idea.prompt_female) throw new Error('AI gagal membuat tema baru')
  idea.id = String(idea.id).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || ('tema-' + Date.now())
  return idea
}

// ── Cron harian: top-up stok foto + spawn tema baru kalau syarat terpenuhi ───
async function handleCronPhotos(req, res, method) {
  const authHeader = req.headers['authorization'] || ''
  if (authHeader !== 'Bearer ' + process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const TARGET_PER_GENDER = 20  // stok target per gender per kategori (total 40/tema)
  const MAX_PER_RUN = 30        // batas foto per eksekusi (jaga durasi & kuota)
  const startedAt = Date.now()

  try {
    // 1. Hitung stok saat ini per kategori × gender
    const { data: cats } = await supabase.from('categories').select('*')
    if (!cats?.length) return res.json({ ok: true, generated: 0, note: 'Tidak ada kategori' })

    const { data: allPhotos } = await supabase.from('photos')
      .select('category_id,gender').gt('expires_at', new Date().toISOString())
    const countMap = {}
    for (const p of (allPhotos || [])) {
      const k = p.category_id + '|' + p.gender
      countMap[k] = (countMap[k] || 0) + 1
    }
    const countOf = (catId, gender) => countMap[catId + '|' + gender] || 0

    const needs = []
    for (const cat of cats) {
      for (const gender of ['laki-laki', 'perempuan']) {
        const prompt = gender === 'laki-laki' ? cat.prompt_male : cat.prompt_female
        if (!prompt) continue
        const have = countOf(cat.id, gender)
        if (have < TARGET_PER_GENDER) needs.push({ cat, gender, prompt, deficit: TARGET_PER_GENDER - have })
      }
    }
    needs.sort((a, b) => b.deficit - a.deficit) // kategori paling kosong duluan

    // 2. Generate sesuai kuota, batas per-run, dan sisa waktu eksekusi
    let generated = 0, failed = 0
    const q0 = await getQuota()
    let remaining = DAILY_BUDGET - q0.used_neurons

    outer: for (const need of needs) {
      for (let i = 0; i < need.deficit; i++) {
        if (generated >= MAX_PER_RUN) break outer
        if (remaining < NEURONS_PER_IMAGE) break outer
        if (Date.now() - startedAt > 260000) break outer // sisakan buffer dari batas 300s
        try {
          const seed = Math.floor(Math.random() * 99999)
          await generatePhotoServerSide(need.cat.id, need.gender, need.prompt, seed)
          generated++
          remaining -= NEURONS_PER_IMAGE
          countMap[need.cat.id + '|' + need.gender] = (countMap[need.cat.id + '|' + need.gender] || 0) + 1
        } catch (e) {
          failed++
          console.error('[cron] photo gen failed:', need.cat.id, need.gender, e.message)
        }
      }
    }

    // 3. Kalau ada kategori yang baru saja lengkap (≥20/gender) & belum pernah memicu spawn → buat tema baru
    let spawnedLabel = null
    const freshlyFull = cats.find(c =>
      !c.spawned_next &&
      countOf(c.id, 'laki-laki') >= TARGET_PER_GENDER &&
      countOf(c.id, 'perempuan') >= TARGET_PER_GENDER
    )
    if (freshlyFull) {
      try {
        const idea = await spawnNewCategory(cats.map(c => c.label))
        let newId = idea.id
        const { data: clash } = await supabase.from('categories').select('id').eq('id', newId).maybeSingle()
        if (clash) newId = newId + '-' + Math.floor(Math.random() * 1000)
        await supabase.from('categories').insert({
          id: newId, label: idea.label, emoji: idea.emoji || '🍼',
          prompt_male: idea.prompt_male, prompt_female: idea.prompt_female,
          usage_count: 0, spawned_next: false,
        })
        await supabase.from('categories').update({ spawned_next: true }).eq('id', freshlyFull.id)
        spawnedLabel = idea.label
        console.log('[cron] Kategori penuh:', freshlyFull.label, '→ tema baru dibuat:', newId, idea.label)
      } catch (e) {
        console.error('[cron] spawn category failed:', e.message)
      }
    }

    console.log(`[cron] Photos: ${generated} generated, ${failed} failed${spawnedLabel ? `, spawned "${spawnedLabel}"` : ''}`)
    return res.json({ ok: true, generated, failed, spawnedCategory: spawnedLabel })
  } catch (e) {
    console.error('[cron] photos error:', e.message)
    return res.status(500).json({ error: e.message })
  }
}
async function handleCronGenerate(req, res, method) {
  const authHeader = req.headers['authorization'] || ''
  if (authHeader !== 'Bearer ' + process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  try {
    const { data: cats } = await supabase.from('categories').select('*')
    if (!cats?.length) { console.log('[cron] generate skip: tidak ada kategori'); return res.json({ ok: true, skipped: true, reason: 'Tidak ada kategori' }) }

    const { data: allPhotos } = await supabase.from('photos')
      .select('category_id,gender,url')
      .gt('expires_at', new Date().toISOString())
    if (!allPhotos?.length) { console.log('[cron] generate skip: tidak ada foto'); return res.json({ ok: true, skipped: true, reason: 'Tidak ada foto — tunggu cron photos jalan dulu' }) }

    // ── Tentukan gender target hari ini (selang-seling dari hari sebelumnya) ──
    const { data: cfg } = await supabase.from('schedule_config')
      .select('last_gender,total_generations').eq('id', 1).single()
    const prevGender = cfg?.last_gender === 'laki-laki' ? 'laki-laki' : 'perempuan'
    const targetGender = prevGender === 'laki-laki' ? 'perempuan' : 'laki-laki'
    const genderCode = targetGender === 'laki-laki' ? 'M' : 'F'

    // ── Pilih kategori: yang punya foto gender target, paling jarang dipakai ──
    let catWithPhotos = cats.filter(c => allPhotos.some(p => p.category_id === c.id && p.gender === targetGender))
    if (!catWithPhotos.length) catWithPhotos = cats.filter(c => allPhotos.some(p => p.category_id === c.id))
    if (!catWithPhotos.length) { console.log('[cron] generate skip: semua kategori kosong'); return res.json({ ok: true, skipped: true, reason: 'Semua kategori kosong' }) }

    const minUsage = Math.min(...catWithPhotos.map(c => c.usage_count || 0))
    const leastUsed = catWithPhotos.filter(c => (c.usage_count || 0) === minUsage)
    const cat = leastUsed[Math.floor(Math.random() * leastUsed.length)]

    const genderPhotos = allPhotos.filter(p => p.category_id === cat.id && p.gender === targetGender)
    const allCatPhotos = allPhotos.filter(p => p.category_id === cat.id)
    const pool = genderPhotos.length ? genderPhotos : allCatPhotos
    if (!pool.length) { console.log('[cron] generate skip: foto kategori kosong'); return res.json({ ok: true, skipped: true, reason: 'Foto kategori terpilih kosong' }) }

    const shuffle = a => { const b=[...a]; for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]];}; return b }
    const shuffled = shuffle(pool)

    // ── Groq: AI pilih sudut tema variatif, semua nama gender target ──────────
    const genderLabel = targetGender === 'laki-laki' ? 'laki-laki (boy)' : 'perempuan (girl)'
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + process.env.GROQ_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages: [
          { role: 'system', content: 'Respond ONLY with valid JSON.' },
          { role: 'user', content: `Kamu membuat konten TikTok nama bayi Indonesia. Folder foto yang dipakai hari ini bergaya visual: "${cat.label}".
Semua 10 nama HARUS untuk bayi ${genderLabel} (gender "${genderCode}" untuk SEMUA nama, karena foto yang tersedia hari ini foto bayi ${genderLabel}).
Pilih SATU sudut tema/angle menarik & variatif yang cocok dengan gaya visual folder "${cat.label}" (misal kalau foldernya "Eropa" bisa angle "nama terinspirasi Jerman", "nama vintage Eropa", "nama modern Skandinavia" — pilih angle berbeda tiap kali, jangan generik/itu-itu saja).
Buat:
1. "theme_angle": nama angle yang kamu pilih (singkat, misal "Nama Terinspirasi Jerman")
2. "hook": kalimat hook TikTok menarik max 14 kata sesuai angle, boleh 2 baris dipisah newline.
3. "cta": 1-2 baris ajakan sesuai angle.
4. "names": PERSIS 10 nama 3 kata sesuai angle, SEMUA gender "${genderCode}", tiap kata dengan arti singkat max 7 kata.
Balas HANYA JSON: {"theme_angle":"...","hook":"...","cta":"...","names":[{"fullName":"K1 K2 K3","gender":"${genderCode}","parts":[{"word":"K1","meaning":"arti"},{"word":"K2","meaning":"arti"},{"word":"K3","meaning":"arti"}]}]}` },
        ],
        response_format: { type: 'json_object' }, temperature: 0.9,
      }),
    })
    const gd = await groqRes.json()
    const ai = JSON.parse((gd.choices?.[0]?.message?.content || '{}').match(/\{[\s\S]*\}/)[0])
    const names = (ai.names || []).slice(0, 10)
    if (!names.length) throw new Error('Groq gagal generate nama')

    const photoUrls = {
      hook: shuffled[0].url,
      names: names.map((n, i) => shuffled[i % shuffled.length].url),
      cta: shuffled[Math.min(1, shuffled.length - 1)].url,
    }

    const id = Date.now().toString()
    await supabase.from('content_packages').insert({
      id, category_id: cat.id, theme: ai.theme_angle || cat.label, emoji: cat.emoji,
      hook: ai.hook, cta: ai.cta, names, photo_urls: photoUrls,
      status: 'ready', auto_generated: true,
    })

    // ── Catat pemakaian kategori + gender untuk giliran selanjutnya ───────────
    await supabase.from('categories').update({
      usage_count: (cat.usage_count || 0) + 1,
      last_used_at: new Date().toISOString(),
    }).eq('id', cat.id)
    await supabase.from('schedule_config').update({
      last_gender: targetGender,
      total_generations: (cfg?.total_generations || 0) + 1,
    }).eq('id', 1)

    console.log('[cron] Package generated:', id, cat.label, '·', ai.theme_angle, '·', targetGender)
    return res.json({ ok: true, id, theme: ai.theme_angle || cat.label, category: cat.label, gender: targetGender, nameCount: names.length })
  } catch(e) {
    console.error('[cron] generate error:', e.message)
    return res.status(500).json({ error: e.message })
  }
}
