import { supabase } from './_supabase.js'

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { data: cats } = await supabase.from('categories').select('id')
    const result = {}
    for (const cat of (cats || [])) {
      const { data: photos } = await supabase.from('photos')
        .select('id,filename,url,gender,created_at')
        .eq('category_id', cat.id)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
      result[cat.id] = {
        'laki-laki': (photos||[]).filter(p=>p.gender==='laki-laki').map(p=>({...p, mtime: new Date(p.created_at).getTime()})),
        'perempuan':  (photos||[]).filter(p=>p.gender==='perempuan' ).map(p=>({...p, mtime: new Date(p.created_at).getTime()})),
      }
    }
    return res.json(result)
  }
}
