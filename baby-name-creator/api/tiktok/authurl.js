export default async function handler(req, res) {
  const ck = process.env.TIKTOK_CLIENT_KEY
  if (!ck) return res.status(500).json({ error:'TIKTOK_CLIENT_KEY belum diset' })
  const appUrl = process.env.APP_URL || `https://${req.headers.host}`
  const params = new URLSearchParams({
    client_key: ck, response_type:'code', scope:'user.info.basic,video.publish',
    redirect_uri: appUrl + '/api/tiktok/callback',
    state: Math.random().toString(36).slice(2),
  })
  return res.json({ authUrl:'https://www.tiktok.com/v2/auth/authorize/?'+params })
}
