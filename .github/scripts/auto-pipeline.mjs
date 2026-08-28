/**
 * 🍼 Auto Pipeline — GitHub Actions
 * Generate nama (Groq) + render canvas (@napi-rs/canvas) + post TikTok
 * Laptop tidak perlu nyala sama sekali
 */
import { createCanvas, registerFont, loadImage } from '@napi-rs/canvas'
import fs   from 'fs'
import path from 'path'

// ── Config ────────────────────────────────────────────────────────────────────
const PHOTOS_DIR  = './public/photos'
const EXPORTS_DIR = './public/exports'
const META_FILE   = path.join(PHOTOS_DIR, '_meta.json')
const TOKEN_FILE  = path.join(EXPORTS_DIR, 'token.json')
const QUEUE_FILE  = path.join(EXPORTS_DIR, 'queue.json')
const S = 1080  // canvas size px

// Font yang di-install di ubuntu runner
const FONTS = [
  '/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf',
]

function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }) }

// ── Load meta & foto ──────────────────────────────────────────────────────────
function readMeta() {
  if (!fs.existsSync(META_FILE)) throw new Error('_meta.json tidak ada. Push dulu dari laptop.')
  return JSON.parse(fs.readFileSync(META_FILE, 'utf8'))
}

function getPhotos(catId, gender) {
  const dir = path.join(PHOTOS_DIR, catId, gender)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter(f => /\.(jpg|jpeg|png)$/i.test(f))
    .map(f => path.join(dir, f))
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ── Generate foto via Cloudflare Worker (jika pool kurang) ───────────────────
async function generatePhoto(prompt, savePath) {
  const url = process.env.CF_WORKER_URL
  if (!url) return false
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })
  if (!r.ok) return false
  const buf = Buffer.from(await r.arrayBuffer())
  if (buf.length < 5000) return false
  fs.writeFileSync(savePath, buf)
  console.log('✅ Photo generated:', savePath)
  return true
}

// ── Groq AI ──────────────────────────────────────────────────────────────────
async function callGroq(prompt) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + process.env.GROQ_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
      messages: [
        { role: 'system', content: 'Respond ONLY with valid JSON, no explanation, no markdown.' },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.85,
    }),
  })
  const d = await r.json()
  if (d.error) throw new Error('Groq error: ' + d.error.message)
  return d.choices?.[0]?.message?.content || ''
}

// ── Wrap text ─────────────────────────────────────────────────────────────────
function wrapText(ctx, text, maxWidth) {
  const lines = []
  for (const raw of text.split('\n')) {
    const words = raw.trim().split(' ')
    let cur = ''
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w
      if (ctx.measureText(test).width > maxWidth && cur) {
        lines.push(cur); cur = w
      } else { cur = test }
    }
    if (cur) lines.push(cur)
  }
  return lines
}

// ── Draw gradient overlay ──────────────────────────────────────────────────────
function drawOverlay(ctx) {
  const grad = ctx.createLinearGradient(0, S * 0.55, 0, S)
  grad.addColorStop(0, 'rgba(0,0,0,0)')
  grad.addColorStop(0.5, 'rgba(0,0,0,0.55)')
  grad.addColorStop(1, 'rgba(0,0,0,0.82)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, S, S)
}

// ── Render frame ──────────────────────────────────────────────────────────────
async function renderFrame(type, data, imgPath) {
  const canvas = createCanvas(S, S)
  const ctx    = canvas.getContext('2d')

  // Background foto
  try {
    const img = await loadImage(imgPath)
    ctx.drawImage(img, 0, 0, S, S)
  } catch {
    ctx.fillStyle = '#1a1814'
    ctx.fillRect(0, 0, S, S)
  }

  drawOverlay(ctx)

  ctx.textAlign    = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor  = 'rgba(0,0,0,0.7)'
  ctx.shadowBlur   = 14

  if (type === 'hook') {
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.font = `italic bold 58px serif`
    const lines  = wrapText(ctx, data.text, S - 100)
    const startY = S - 160 - (lines.length - 1) * 72
    lines.forEach((l, i) => ctx.fillText(l, S / 2, startY + i * 72))

  } else if (type === 'main') {
    // Full name
    ctx.fillStyle = '#ffffff'
    ctx.font = `bold 68px serif`
    ctx.fillText(data.fullName || '', S / 2, S * 0.6)

    // Divider
    ctx.fillStyle = '#c9a96e'
    ctx.font = `bold 24px sans-serif`
    ctx.fillText('✦', S / 2, S * 0.675)

    // Word meanings
    ctx.fillStyle = 'rgba(255,255,255,0.88)'
    ctx.font = `400 30px sans-serif`
    const parts = data.parts || []
    parts.forEach((p, i) => {
      const y = S * 0.735 + i * 52
      ctx.fillStyle = '#c9a96e'
      ctx.font = `bold 32px sans-serif`
      ctx.fillText(p.word, S / 2, y)
      ctx.fillStyle = 'rgba(255,255,255,0.8)'
      ctx.font = `300 26px sans-serif`
      ctx.fillText(p.meaning || '', S / 2, y + 30)
    })

  } else if (type === 'cta') {
    ctx.font = `bold 58px serif`
    const lines  = wrapText(ctx, data.text, S - 80)
    const startY = S - 175 - (lines.length - 1) * 80
    lines.forEach((l, i) => {
      ctx.fillStyle = '#ffffff'
      ctx.fillText(l, S / 2, startY + i * 82)
    })

    // Badge CTA
    ctx.fillStyle = 'rgba(201,169,110,0.9)'
    ctx.beginPath()
    ctx.roundRect(S/2 - 80, 30, 160, 50, 12)
    ctx.fill()
    ctx.fillStyle = '#1a1814'
    ctx.font = `bold 26px sans-serif`
    ctx.fillText('CTA', S / 2, 56)
  }

  return canvas.toBuffer('image/jpeg', { quality: 0.92 })
}

// ── TikTok token ──────────────────────────────────────────────────────────────
function readToken() {
  if (!fs.existsSync(TOKEN_FILE)) return null
  return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'))
}
function writeToken(t) { fs.writeFileSync(TOKEN_FILE, JSON.stringify(t, null, 2)) }

async function refreshTikTokToken(tokenData) {
  const form = new URLSearchParams({
    client_key:     process.env.TIKTOK_CLIENT_KEY,
    client_secret:  process.env.TIKTOK_CLIENT_SECRET,
    grant_type:     'refresh_token',
    refresh_token:  tokenData.refreshToken,
  })
  const r = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form,
  })
  return r.json()
}

async function postTikTok(token, photoUrls, caption) {
  const r = await fetch('https://open.tiktokapis.com/v2/post/publish/content/init/', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({
      post_info: { title: caption, privacy_level: 'SELF_ONLY', disable_comment: false, auto_add_music: true },
      source_info: { source: 'PULL_FROM_URL', photo_images: photoUrls, photo_cover_index: 0 },
      post_mode: 'DIRECT_POST', media_type: 'PHOTO',
    }),
  })
  return r.json()
}

// ── Main Pipeline ─────────────────────────────────────────────────────────────
async function main() {
  console.log('🍼 Auto Pipeline Start —', new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }), 'WIB')

  // Register fonts
  for (const f of FONTS) {
    if (fs.existsSync(f)) { registerFont(f, { family: 'serif' }); console.log('Font loaded:', f) }
  }

  ensureDir(EXPORTS_DIR)

  // ── 1. Baca kategori & pilih random ──────────────────────────────────────
  const { categories } = readMeta()
  if (!categories?.length) throw new Error('Tidak ada kategori di _meta.json')

  // Pilih kategori yang punya foto tersedia
  const eligible = categories.filter(c => {
    const m = getPhotos(c.id, 'laki-laki').length
    const f = getPhotos(c.id, 'perempuan').length
    return m + f > 0
  })

  // Kalau semua kosong → generate foto dulu via CF Worker
  if (!eligible.length && process.env.CF_WORKER_URL) {
    console.log('⚠️ Semua foto habis, generate via Cloudflare...')
    const cat = categories[0]
    const dir = path.join(PHOTOS_DIR, cat.id, 'laki-laki')
    ensureDir(dir)
    const ok = await generatePhoto(cat.promptMale || 'cute baby boy portrait photo', path.join(dir, Date.now() + '_auto.jpg'))
    if (ok) eligible.push(cat)
  }

  if (!eligible.length) throw new Error('Tidak ada foto tersedia dan CF_WORKER_URL tidak diset.')

  const cat = eligible[Math.floor(Math.random() * eligible.length)]
  console.log('📁 Kategori terpilih:', cat.emoji, cat.label)

  // ── 2. Siapkan pool foto (random) ────────────────────────────────────────
  const male   = shuffle(getPhotos(cat.id, 'laki-laki'))
  const female = shuffle(getPhotos(cat.id, 'perempuan'))
  const all    = shuffle([...male, ...female])
  if (!all.length) throw new Error('Folder foto kosong: ' + cat.id)

  const pickPhoto = (nameGender, idx) => {
    if (nameGender === 'F') return (female.length ? female : all)[idx % (female.length || all.length)]
    return (male.length ? male : all)[idx % (male.length || all.length)]
  }

  // ── 3. Groq: generate hook + CTA + 10 nama ───────────────────────────────
  console.log('🤖 Generate nama via Groq...')
  const aiPrompt = `Kamu membuat konten media sosial nama bayi Indonesia bertema: "${cat.label}".
Buat:
1. "hook": kalimat pembuka menarik gaya hook TikTok (boleh 2 baris dipisah \\n), maksimal 14 kata, sesuai tema "${cat.label}".
2. "cta": 1-2 baris ajakan klik link di bio untuk lihat nama lainnya, sesuai tema.
3. "names": PERSIS 10 nama bayi 3 kata sesuai tema "${cat.label}", campuran M dan F, tiap kata dengan arti singkat (maks 7 kata Bahasa Indonesia) dan gender M atau F.
Balas HANYA JSON valid, tanpa penjelasan:
{"hook":"baris1\\nbaris2","cta":"baris1","names":[{"fullName":"Kata1 Kata2 Kata3","gender":"M","parts":[{"word":"Kata1","meaning":"arti"},{"word":"Kata2","meaning":"arti"},{"word":"Kata3","meaning":"arti"}]}]}`

  const raw = await callGroq(aiPrompt)
  const result = JSON.parse(raw.match(/\{[\s\S]*\}/)[0])
  const names  = (result.names || []).slice(0, 10)
  const hook   = result.hook || 'Nama bayi indah penuh makna'
  const cta    = result.cta  || 'Klik link di bio untuk lebih banyak inspirasi!'
  console.log(`✅ ${names.length} nama: ${names.map(n=>n.fullName).join(', ')}`)

  // ── 4. Render 12 frame ───────────────────────────────────────────────────
  console.log('🎨 Render 12 frame...')
  const id     = Date.now().toString()
  const outDir = path.join(EXPORTS_DIR, id)
  ensureDir(outDir)

  const labels = ['hook', ...names.map(n => n.fullName.replace(/\s+/g,'_').slice(0,20)), 'cta']

  // Frame 0: hook
  const hookBuf = await renderFrame('hook', { text: hook }, all[0])
  fs.writeFileSync(path.join(outDir, '00_hook.jpg'), hookBuf)
  console.log('  ✅ hook')

  // Frame 1-10: nama
  for (let i = 0; i < names.length; i++) {
    const n = names[i]
    const photo = pickPhoto(n.gender, i + 1)
    const buf = await renderFrame('main', n, photo)
    const fname = String(i+1).padStart(2,'0') + '_' + (labels[i+1] || 'name') + '.jpg'
    fs.writeFileSync(path.join(outDir, fname), buf)
    if ((i+1) % 3 === 0) console.log(`  ✅ ${i+1}/10 nama`)
  }

  // Frame 11: CTA
  const ctaBuf = await renderFrame('cta', { text: cta }, all[Math.min(1, all.length-1)])
  fs.writeFileSync(path.join(outDir, '11_cta.jpg'), ctaBuf)
  console.log('  ✅ cta')

  // Meta
  fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify({
    labels, theme: cat.label, category: cat.id, hook, cta,
    names: names.map(n => n.fullName),
    createdAt: new Date().toISOString(),
    auto: true,
  }, null, 2))

  // ── 5. Update queue ──────────────────────────────────────────────────────
  const queue = fs.existsSync(QUEUE_FILE) ? JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8')) : { pending: [], posted: [] }
  queue.pending = queue.pending || []
  queue.pending.push(id)
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2))
  console.log(`📁 Export ${id} disimpan (${names.length + 2} frame)`)

  // ── 6. Post ke TikTok ────────────────────────────────────────────────────
  const baseUrl = process.env.GITHUB_PAGES_URL
  if (!baseUrl) throw new Error('GITHUB_PAGES_URL belum diset di secrets')

  let tokenData = readToken()
  if (!tokenData?.accessToken) throw new Error('token.json tidak ada. Login TikTok dari laptop dulu, lalu push.')

  // Auto-refresh token
  if (tokenData.expiresAt && Date.now() > tokenData.expiresAt - 600000) {
    console.log('🔄 Refresh TikTok token...')
    const refreshed = await refreshTikTokToken(tokenData)
    if (refreshed.access_token) {
      tokenData.accessToken  = refreshed.access_token
      tokenData.refreshToken = refreshed.refresh_token || tokenData.refreshToken
      tokenData.expiresAt    = Date.now() + refreshed.expires_in * 1000
      writeToken(tokenData)
      console.log('✅ Token refreshed')
    }
  }

  const files = fs.readdirSync(outDir).filter(f => /\.jpg$/i.test(f)).sort()
  const photoUrls = files.map(f => `${baseUrl}/exports/${id}/${f}`)
  const caption = `${hook.replace(/\n/g, ' ')}\n#namabayi #${cat.id.replace(/-/g,'')} #bayilucu #namaislami`

  console.log('📤 Post ke TikTok...')
  console.log('   URL:', photoUrls[0])
  const result2 = await postTikTok(tokenData.accessToken, photoUrls, caption)
  console.log('   Response:', JSON.stringify(result2))

  if (result2.error?.code === 'ok' || result2.data?.publish_id) {
    const publishId = result2.data?.publish_id
    console.log('✅ TikTok post berhasil! publish_id:', publishId)

    // Update queue
    queue.pending.pop()
    queue.posted = queue.posted || []
    queue.posted.unshift({ id, publishId, theme: cat.label, time: new Date().toISOString() })
    if (queue.posted.length > 50) queue.posted = queue.posted.slice(0, 50)
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2))
  } else {
    console.error('❌ TikTok error:', result2.error?.message || JSON.stringify(result2))
    process.exit(1)
  }

  console.log('\n🎉 Pipeline selesai!')
}

main().catch(e => { console.error('\n❌ Fatal error:', e.message); process.exit(1) })
