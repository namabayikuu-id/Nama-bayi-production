export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { prompt } = req.body
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization:`Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type':'application/json' },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
        messages: [
          { role:'system', content:'Respond ONLY with valid JSON, no explanation, no markdown.' },
          { role:'user', content:prompt },
        ],
        response_format: { type:'json_object' },
        temperature: 0.85,
      }),
    })
    const d = await r.json()
    if (!r.ok || d.error) return res.status(500).json({ error: d.error?.message || 'Groq error' })
    return res.json({ text: d.choices?.[0]?.message?.content || '' })
  } catch(e) {
    return res.status(500).json({ error: e.message })
  }
}
