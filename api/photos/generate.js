import { supabase, addQuotaUsage, getQuota, NEURONS_PER_IMAGE, DAILY_BUDGET } from '../_supabase.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { prompt, category, gender, seed } = req.body

  // Cek quota
  const q = await getQuota()
  if (q.used_neurons + NEURONS_PER_IMAGE > DAILY_BUDGET) {
    return res.status(429).json({ error: 'QUOTA_EXCEEDED: Budget neuron harian habis. Reset 00:00 UTC.' })
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

    // Upload ke Supabase Storage
    const filename = `${Date.now()}_${seed}.jpg`
    const storagePath = `${category}/${gender}/${filename}`
    const { error: upErr } = await supabase.storage.from('photos')
      .upload(storagePath, buf, { contentType: 'image/jpeg', upsert: false })
    if (upErr) throw new Error('Upload storage: ' + upErr.message)

    const { data: { publicUrl } } = supabase.storage.from('photos').getPublicUrl(storagePath)

    // Simpan ke DB
    const expiresAt = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString()
    await supabase.from('photos').insert({
      category_id: category, gender, filename, storage_path: storagePath, url: publicUrl, expires_at: expiresAt
    })

    const quota = await addQuotaUsage(NEURONS_PER_IMAGE)
    console.log('[api] ✅ Photo saved:', storagePath, '| Quota:', quota.used + '/' + quota.budget)
    return res.json({ url: publicUrl, filename, quota })
  } catch (e) {
    console.error('[api] Generate error:', e.message)
    return res.status(500).json({ error: e.message })
  }
}
