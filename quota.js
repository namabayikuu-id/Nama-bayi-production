import { getQuota, NEURONS_PER_IMAGE, DAILY_BUDGET } from './_supabase.js'

export default async function handler(req, res) {
  const q = await getQuota()
  const remaining = Math.max(0, DAILY_BUDGET - q.used_neurons)
  return res.json({
    used: q.used_neurons, budget: DAILY_BUDGET, remaining,
    neuronsPerImage: NEURONS_PER_IMAGE,
    estimatedPhotosLeft: Math.floor(remaining / NEURONS_PER_IMAGE),
    date: q.date,
  })
}
