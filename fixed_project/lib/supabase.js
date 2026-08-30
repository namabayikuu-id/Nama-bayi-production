import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY  // service role key — full access
)

export const NEURONS_PER_IMAGE = 58
export const DAILY_BUDGET      = 10000

// ── Helper: baca/update quota ──────────────────────────────────────────────
export async function getQuota() {
  const today = new Date().toISOString().slice(0, 10)
  const { data } = await supabase.from('quota').select('*').eq('id', 1).single()
  if (!data || data.date !== today) {
    await supabase.from('quota').upsert({ id:1, date:today, used_neurons:0 })
    return { date:today, used_neurons:0 }
  }
  return data
}

export async function addQuotaUsage(neurons) {
  const q = await getQuota()
  const used = q.used_neurons + neurons
  await supabase.from('quota').update({ used_neurons: used }).eq('id', 1)
  return { used, budget: DAILY_BUDGET, remaining: Math.max(0, DAILY_BUDGET - used),
    estimatedPhotosLeft: Math.floor(Math.max(0, DAILY_BUDGET - used) / NEURONS_PER_IMAGE),
    neuronsPerImage: NEURONS_PER_IMAGE }
}

export function json(res, data, status = 200) {
  res.status(status).json(data)
}
