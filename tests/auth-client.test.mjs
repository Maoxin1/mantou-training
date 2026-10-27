import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createAuthClient,BetterAuthVanillaAdapter} from '../dist/auth-sdk.mjs';

test('bundled Neon client sends OTP, signs in, loads a session and signs out against a mock service',async t=>{
  const calls=[];
  const server=createServer(async(req,res)=>{
    let body='';for await(const chunk of req)body+=chunk;
    const path=new URL(req.url,'http://localhost').pathname;
    calls.push({path,method:req.method,body:body?JSON.parse(body):null});
    res.setHeader('Content-Type','application/json');
    if(path.endsWith('/get-session'))res.end(JSON.stringify({user:{id:'synthetic-user',email:'test@example.invalid'},session:{id:'synthetic-session'}}));
    else if(path.endsWith('/sign-in/email-otp'))res.end(JSON.stringify({user:{id:'synthetic-user',email:'test@example.invalid'},token:'synthetic-token'}));
    else res.end(JSON.stringify({success:true}));
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const auth=createAuthClient(`http://127.0.0.1:${server.address().port}`,{adapter:BetterAuthVanillaAdapter({fetchOptions:{credentials:'include'}})});
  const sent=await auth.emailOtp.sendVerificationOtp({email:'test@example.invalid',type:'sign-in'});
  assert.equal(sent.error,null);
  const signed=await auth.signIn.emailOtp({email:'test@example.invalid',otp:'123456'});
  assert.equal(signed.error,null);
  const session=await auth.getSession();
  assert.equal(session.data?.user?.id,'synthetic-user',JSON.stringify({session,calls}));
  const signedOut=await auth.signOut();
  assert.equal(signedOut.error,null);
  for(const path of ['/email-otp/send-verification-otp','/sign-in/email-otp','/get-session','/sign-out'])assert(calls.some(call=>call.path.endsWith(path)),`missing ${path}`);
});
