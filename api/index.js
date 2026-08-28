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

  const q = await getQuota()
  if (q.used_neurons + NEURONS_PER_IMAGE > DAILY_BUDGET) {
    return res
      .status(429)
      .json({ error: 'QUOTA_EXCEEDED: Budget neuron harian habis. Reset 00:00 UTC.' })
  }

  try {
    const cfUrl = process.env.CF_WORKER_URL
    if (!cfUrl) throw new Error('CF_WORKER_URL belum diset di Vercel environment variables')

    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 120000)
    const cfRes = await fetch(cfUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, seed }),
      signal: ctrl.signal,
    })
    clearTimeout(t)

    if (!cfRes.ok) throw new Error('Cloudflare Worker HTTP ' + cfRes.status)
    const buf = Buffer.from(await cfRes.arrayBuffer())
    if (buf.length < 5000) throw new Error('Gambar terlalu kecil')

    const filename = `${Date.now()}_${seed}.jpg`
    const storagePath = `${category}/${gender}/${filename}`
    const { error: upErr } = await supabase.storage
      .from('photos')
      .upload(storagePath, buf, { contentType: 'image/jpeg', upsert: false })
    if (upErr) throw new Error('Upload storage: ' + upErr.message)

    const {
      data: { publicUrl },
    } = supabase.storage.from('photos').getPublicUrl(storagePath)

    const expiresAt = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString()
    await supabase.from('photos').insert({
      category_id: category,
      gender,
      filename,
      storage_path: storagePath,
      url: publicUrl,
      expires_at: expiresAt,
    })

    const quota = await addQuotaUsage(NEURONS_PER_IMAGE)
    console.log('[api] ✅ Photo saved:', storagePath, '| Quota:', quota.used + '/' + quota.budget)
    return res.json({ url: publicUrl, filename, quota })
  } catch (e) {
    console.error('[api] Generate error:', e.message)
    return res.status(500).json({ error: e.message })
  }
}

/** Upload foto manual (base64) — endpoint yang dipanggil frontend tapi sebelumnya belum ada file-nya */
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
      .from('photos')
      .upload(storagePath, buf, { contentType: 'image/jpeg', upsert: false })
    if (upErr) throw new Error('Upload storage: ' + upErr.message)

    const {
      data: { publicUrl },
    } = supabase.storage.from('photos').getPublicUrl(storagePath)

    const expiresAt = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString()
    await supabase.from('photos').insert({
      category_id: category,
      gender,
      filename,
      storage_path: storagePath,
      url: publicUrl,
      expires_at: expiresAt,
    })

    return res.json({ url: publicUrl, filename, ok: true })
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

async function handleAiChat(req, res, method) {
  if (method !== 'POST') return res.status(405).end()
  const { prompt } = req.body || {}
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
        messages: [
          {
            role: 'system',
            content: 'Respond ONLY with valid JSON, no explanation, no markdown.',
          },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.85,
      }),
    })
    const d = await r.json()
    if (!r.ok || d.error) {
      return res.status(500).json({ error: d.error?.message || 'Groq error' })
    }
    return res.json({ text: d.choices?.[0]?.message?.content || '' })
  } catch (e) {
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
