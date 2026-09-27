import{createClient}from'@supabase/supabase-js';import{firebaseAuth}from'./firebase';
export const SUPABASE_URL='https://ejlgobrbajobdbcjodhr.supabase.co'
export const SUPABASE_KEY='sb_publishable_Y1qSvfxdjUUpIzH6USAl2g_di7FwICk'
export const supabase=createClient(SUPABASE_URL,SUPABASE_KEY,{accessToken:async()=>firebaseAuth.currentUser?(await firebaseAuth.currentUser.getIdToken(false)):null})
