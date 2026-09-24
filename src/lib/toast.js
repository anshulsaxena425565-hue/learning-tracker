export function toast(message,type='success',title=''){if(typeof window==='undefined')return;window.dispatchEvent(new CustomEvent('learning:toast',{detail:{message,type,title}}));}
