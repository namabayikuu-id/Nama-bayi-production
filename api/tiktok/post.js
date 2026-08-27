import { supabase } from '../_supabase.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { data:cfg } = await supabase.from('schedule_config').select('*').eq('id',1).single()

  // TikTok posting DISABLED sambil nunggu app approval
  if (!cfg?.enabled) {
    return res.status(403).json({ error:'TikTok posting belum diaktifkan — menunggu approval TikTok Developer.' })
  }

  if (!cfg.tiktok_access_token) return res.status(400).json({ error:'Belum login TikTok' })
  if (!cfg.pending_exports?.length) return res.status(400).json({ error:'Tidak ada konten di antrian' })

  const exportId = cfg.pending_exports[0]
  const { data:frames } = await supabase.from('export_frames')
    .select('url').eq('export_id', exportId).order('sort_order')
  if (!frames?.length) return res.status(404).json({ error:'Frame tidak ditemukan' })

  const photoUrls = frames.map(f=>f.url)
  const r = await fetch('https://open.tiktokapis.com/v2/post/publish/content/init/', {
    method:'POST',
    headers:{ Authorization:'Bearer '+cfg.tiktok_access_token, 'Content-Type':'application/json; charset=UTF-8' },
    body: JSON.stringify({
      post_info: { title:cfg.caption, privacy_level:'SELF_ONLY', disable_comment:false, auto_add_music:true },
      source_info: { source:'PULL_FROM_URL', photo_images:photoUrls, photo_cover_index:0 },
      post_mode:'DIRECT_POST', media_type:'PHOTO',
    }),
  })
  const result = await r.json()
  console.log('[tiktok] post result:', JSON.stringify(result))

  if (result.error?.code === 'ok' || result.data?.publish_id) {
    const pending = cfg.pending_exports.filter(e=>e!==exportId)
    await supabase.from('schedule_config').update({
      pending_exports: pending,
      last_post: { time:new Date().toISOString(), exportId, publishId:result.data?.publish_id },
    }).eq('id',1)
    await supabase.from('exports').update({ pending:false }).eq('id', exportId)
  }
  return res.json(result)
}
