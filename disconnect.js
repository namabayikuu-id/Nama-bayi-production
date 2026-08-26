import { supabase } from '../_supabase.js'
export default async function handler(req, res) {
  await supabase.from('schedule_config').update({
    tiktok_access_token:null, tiktok_refresh_token:null,
    tiktok_open_id:null, tiktok_username:null, tiktok_expires_at:null,
  }).eq('id',1)
  return res.json({ ok:true })
}
