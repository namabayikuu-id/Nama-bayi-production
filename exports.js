import { supabase } from './_supabase.js'

export default async function handler(req, res) {
  // GET — list exports
  if (req.method === 'GET') {
    const { data: cfg } = await supabase.from('schedule_config').select('pending_exports').eq('id',1).single()
    const pending = cfg?.pending_exports || []
    const { data: exports_ } = await supabase.from('exports')
      .select('id,theme,frame_count,labels,pending,created_at')
      .order('created_at', { ascending: false })
      .limit(20)
    const result = await Promise.all((exports_||[]).map(async ex => {
      const { data: frames } = await supabase.from('export_frames')
        .select('filename,url,sort_order')
        .eq('export_id', ex.id)
        .order('sort_order')
      return { ...ex, files: frames||[], pending: pending.includes(ex.id) }
    }))
    return res.json(result)
  }

  // DELETE — hapus export
  if (req.method === 'DELETE') {
    const { id } = req.body
    const { data: frames } = await supabase.from('export_frames').select('storage_path').eq('export_id', id)
    if (frames?.length) await supabase.storage.from('exports').remove(frames.map(f=>f.storage_path))
    await supabase.from('exports').delete().eq('id', id)
    const { data: cfg } = await supabase.from('schedule_config').select('pending_exports').eq('id',1).single()
    const pending = (cfg?.pending_exports||[]).filter(e=>e!==id)
    await supabase.from('schedule_config').update({ pending_exports:pending }).eq('id',1)
    return res.json({ ok: true })
  }
}
