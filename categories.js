import { supabase } from './_supabase.js'

const DEFAULT_CATEGORIES = [
  { id:'bayi-islami',    label:'Bayi Islami',    emoji:'🕌',
    prompt_male:   'Professional portrait photo of a cute healthy chubby baby boy, wearing white thobe, Muslim Islamic style, warm golden lighting, sitting upright, upper body visible, chubby cheeks bright eyes, bokeh background, sharp focus, high quality DSLR',
    prompt_female: 'Professional portrait photo of a cute healthy chubby baby girl, wearing white hijab pastel outfit, Muslim Islamic style, warm golden lighting, sitting upright, upper body visible, chubby cheeks bright eyes, bokeh background, sharp focus, high quality DSLR' },
  { id:'bayi-eropa',     label:'Bayi Eropa',     emoji:'🌿',
    prompt_male:   'Professional portrait photo of a cute healthy chubby European baby boy, blonde hair blue eyes, wearing soft white shirt, bright natural daylight, sitting upright, upper body visible, chubby cheeks, bokeh background, sharp focus, high quality DSLR',
    prompt_female: 'Professional portrait photo of a cute healthy chubby European baby girl, blonde hair blue eyes, wearing soft white floral dress, bright natural daylight, sitting upright, upper body visible, chubby cheeks, bokeh background, sharp focus, high quality DSLR' },
]

export default async function handler(req, res) {
  if (req.method === 'GET') {
    let { data } = await supabase.from('categories').select('*').order('created_at')
    if (!data?.length) {
      await supabase.from('categories').upsert(DEFAULT_CATEGORIES)
      data = DEFAULT_CATEGORIES
    }
    return res.json(data.map(c => ({
      id: c.id, label: c.label, emoji: c.emoji,
      promptMale: c.prompt_male, promptFemale: c.prompt_female
    })))
  }

  if (req.method === 'POST') {
    const { id, label, emoji, promptMale, promptFemale } = req.body
    await supabase.from('categories').upsert({
      id, label, emoji, prompt_male: promptMale, prompt_female: promptFemale
    })
    return res.json({ ok: true })
  }

  if (req.method === 'DELETE') {
    const { id } = req.body
    // Hapus foto dari storage dulu
    const { data: photos } = await supabase.from('photos')
      .select('storage_path').eq('category_id', id)
    if (photos?.length) {
      await supabase.storage.from('photos').remove(photos.map(p => p.storage_path))
    }
    await supabase.from('categories').delete().eq('id', id)
    return res.json({ ok: true })
  }
}
