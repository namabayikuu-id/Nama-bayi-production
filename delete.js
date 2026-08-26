import { supabase } from '../_supabase.js'

export default async function handler(req, res) {
  if (req.method !== 'DELETE') return res.status(405).end()
  const { category, gender, filename } = req.body
  const storagePath = `${category}/${gender}/${filename}`
  await supabase.storage.from('photos').remove([storagePath])
  await supabase.from('photos').delete().eq('storage_path', storagePath)
  return res.json({ ok: true })
}
