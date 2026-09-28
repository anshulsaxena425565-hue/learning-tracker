import { supabase } from './supabase'
export const courseService={
 update: (id,teamId,changes)=>supabase.from('playlists').update({...changes,updated_at:new Date().toISOString()}).eq('id',id).eq('team_id',teamId),
 remove: (id,teamId)=>supabase.from('playlists').delete().eq('id',id).eq('team_id',teamId),
 removeVideo: id=>supabase.from('playlist_videos').delete().eq('id',id),
}
