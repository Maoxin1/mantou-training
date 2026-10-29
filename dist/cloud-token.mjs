// Request the JWT endpoint directly: the current Neon client can mistake /token
// for a cached /get-session response after login.
export async function getSyncToken(authUrl){
  try{
    const response=await fetch(authUrl.replace(/\/$/,'')+'/token',{credentials:'include',cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error();
    const result=await response.json();
    if(typeof result.token!=='string'||!result.token)throw Error();
    return result.token;
  }catch{throw Error('需要联网重新登录；待同步记录仍保留');}
}
