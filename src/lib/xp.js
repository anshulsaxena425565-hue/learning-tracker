export const XP_PER_MINUTE=8;
export const COMPLETION_XP=50;

export function videoProgressXp(row){
 const watched=Math.max(0,Number(row?.watched_seconds)||0);
 return Math.round(watched/60*XP_PER_MINUTE)+(row?.completed_at?COMPLETION_XP:0);
}

export function totalVideoProgressXp(rows){
 return (rows||[]).reduce((total,row)=>total+videoProgressXp(row),0);
}
