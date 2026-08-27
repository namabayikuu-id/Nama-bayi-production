/**
 * Vercel Cron — jalankan tiap 00:00 UTC
 * Hapus foto expired dari Supabase Storage
 */
import { supabase } from '../_supabase.js'

export default async function handler(req, res) {
  // Vercel cron auth
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end()
  }

  // Ambil foto yang expired
  const { data: expired } = await supabase.from('photos')
    .select('storage_path')
    .lt('expires_at', new Date().toISOString())

  if (expired?.length) {
    // Hapus dari storage
    await supabase.storage.from('photos').remove(expired.map(p => p.storage_path))
    // Hapus dari DB
    await supabase.from('photos')
      .delete().lt('expires_at', new Date().toISOString())
    console.log(`[cron] Deleted ${expired.length} expired photos`)
  }

  // Reset quota jika ganti hari
  await supabase.from('quota')
    .update({ used_neurons:0, date: new Date().toISOString().slice(0,10) })
    .lt('date', new Date().toISOString().slice(0,10))

  return res.json({ ok:true, deleted: expired?.length || 0 })
}
