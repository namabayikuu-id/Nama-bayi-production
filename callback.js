import { supabase } from '../_supabase.js'

export default async function handler(req, res) {
  const code = req.query.code
  if (!code) return res.status(400).send('Missing code')
  const appUrl = process.env.APP_URL || `https://${req.headers.host}`
  try {
    const form = new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY,
      client_secret: process.env.TIKTOK_CLIENT_SECRET,
      code, grant_type:'authorization_code',
      redirect_uri: appUrl + '/api/tiktok/callback',
    })
    const td = await (await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:form,
    })).json()
    if (!td.access_token) throw new Error(JSON.stringify(td))
    const ud = await (await fetch('https://open.tiktokapis.com/v2/user/info/?fields=display_name', {
      headers:{ Authorization:'Bearer '+td.access_token }
    })).json()
    const username = ud.data?.user?.display_name || 'Unknown'
    await supabase.from('schedule_config').update({
      tiktok_access_token:  td.access_token,
      tiktok_refresh_token: td.refresh_token,
      tiktok_open_id:       td.open_id,
      tiktok_expires_at:    Date.now() + td.expires_in * 1000,
      tiktok_username:      username,
      app_url:              appUrl,
    }).eq('id', 1)
    console.log('[tiktok] Connected:', username)
    res.redirect(appUrl + '/?tiktok=connected')
  } catch(e) { res.status(500).send('TikTok error: '+e.message) }
}
