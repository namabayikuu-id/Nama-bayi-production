import { supabase } from './_supabase.js'

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { data } = await supabase.from('schedule_config').select('*').eq('id',1).single()
    if (!data) return res.json({ enabled:false, hour:15, minute:0, tiktok:{} })
    return res.json({
      enabled: data.enabled,
      hour: data.hour, minute: data.minute,
      caption: data.caption,
      appUrl: data.app_url,
      pendingExports: data.pending_exports || [],
      lastPost: data.last_post,
      tiktok: data.tiktok_access_token ? {
        accessToken: data.tiktok_access_token,
        refreshToken: data.tiktok_refresh_token,
        username: data.tiktok_username,
        openId: data.tiktok_open_id,
        expiresAt: data.tiktok_expires_at,
      } : null,
    })
  }

  if (req.method === 'POST') {
    const body = req.body
    const update = { updated_at: new Date().toISOString() }
    if (body.enabled  !== undefined) update.enabled   = body.enabled
    if (body.hour     !== undefined) update.hour      = body.hour
    if (body.minute   !== undefined) update.minute    = body.minute
    if (body.caption  !== undefined) update.caption   = body.caption
    if (body.appUrl   !== undefined) update.app_url   = body.appUrl
    if (body.tiktok) {
      update.tiktok_access_token  = body.tiktok.accessToken
      update.tiktok_refresh_token = body.tiktok.refreshToken
      update.tiktok_username      = body.tiktok.username
      update.tiktok_open_id       = body.tiktok.openId
      update.tiktok_expires_at    = body.tiktok.expiresAt
    }
    await supabase.from('schedule_config').update(update).eq('id',1)
    return res.json({ ok:true })
  }
}
