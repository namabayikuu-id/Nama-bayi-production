import { supabase } from '../_supabase.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { frames, meta } = req.body
  const id = Date.now().toString()

  // Upload tiap frame ke Supabase Storage
  const frameRows = []
  for (let i = 0; i < frames.length; i++) {
    const buf = Buffer.from(frames[i], 'base64')
    const filename = String(i).padStart(2,'0') + '_' + (meta?.labels?.[i]||'frame') + '.jpg'
    const storagePath = `${id}/${filename}`
    await supabase.storage.from('exports').upload(storagePath, buf, { contentType:'image/jpeg' })
    const { data:{ publicUrl } } = supabase.storage.from('exports').getPublicUrl(storagePath)
    frameRows.push({ export_id:id, filename, storage_path:storagePath, url:publicUrl, sort_order:i })
  }

  // Insert export row
  await supabase.from('exports').insert({
    id, theme:meta?.theme, category_id:meta?.category,
    frame_count:frames.length, labels:meta?.labels,
    names:meta?.names, pending:true,
  })
  await supabase.from('export_frames').insert(frameRows)

  // Tambah ke pending_exports
  const { data:cfg } = await supabase.from('schedule_config').select('pending_exports').eq('id',1).single()
  const pending = [...(cfg?.pending_exports||[]), id]
  await supabase.from('schedule_config').update({ pending_exports:pending }).eq('id',1)

  console.log('[api] Export saved:', id, frames.length, 'frames')
  return res.json({ ok:true, id })
}
