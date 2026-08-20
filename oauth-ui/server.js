import express from "express";

const app = express();
const port = Number(process.env.PORT || 3000);
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || "";

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error("SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required.");
}

app.disable("x-powered-by");
app.get("/health", (_req, res) => res.json({ ok: true }));

app.get(["/", "/oauth/consent"], (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connect OBS Creator Assistant</title>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#202020;background:#f4f4f4}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px}main{width:min(560px,100%);background:#fff;border:1px solid #ddd;border-radius:20px;padding:32px;box-shadow:0 14px 45px rgba(0,0,0,.08)}h1{margin:0 0 8px}p{color:#555;line-height:1.5}label{display:block;margin:14px 0 6px;font-weight:650}input{width:100%;padding:12px;border:1px solid #ccc;border-radius:9px;font:inherit}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}button{border:0;border-radius:10px;padding:12px 18px;font:inherit;cursor:pointer}button:disabled{cursor:wait;opacity:.65}.primary{background:#1f1f1f;color:#fff}.secondary{background:#eee;color:#1f1f1f}.link{background:transparent;color:#333;padding-left:0;text-decoration:underline}.danger{background:#f4e8e8;color:#7b2020}.card{padding:16px;background:#f7f7f7;border-radius:12px;margin:18px 0}.hidden{display:none}.error{color:#9b1c1c;margin-top:14px}.ok{color:#176b37;margin-top:14px}.hint{font-size:.9rem;color:#777;margin-top:6px}small{color:#777;display:block;margin-top:18px;line-height:1.45}</style>
</head>
<body><main>
<h1>OBS Creator Assistant</h1>
<p id="intro">Connect ChatGPT securely to your OBS computer.</p>
<div id="message" role="status" aria-live="polite"></div>
<section id="auth">
<h2 id="authTitle">Sign in</h2>
<label for="email">Email</label><input id="email" type="email" autocomplete="email" required>
<label for="password">Password</label><input id="password" type="password" autocomplete="current-password" required>
<div id="confirmWrap" class="hidden">
<label for="confirmPassword">Confirm password</label><input id="confirmPassword" type="password" autocomplete="new-password">
<p class="hint">Use at least 8 characters.</p>
</div>
<div class="actions"><button class="primary" id="submitAuth">Sign in</button></div>
<button class="link" id="switchMode">New here? Create an account</button>
</section>
<section id="confirmEmail" class="hidden">
<div class="card"><strong>Check your email</strong><p>Open the confirmation email we sent you, then return here. This page will continue automatically.</p></div>
<button class="primary" id="confirmed">I've confirmed my email</button>
</section>
<section id="consent" class="hidden">
<div class="card"><strong id="clientName">ChatGPT</strong><p id="scopeText">is requesting access to control only the OBS computers paired to your account.</p></div>
<div class="actions"><button class="primary" id="approve">Allow and continue</button><button class="danger" id="deny">Deny</button><button class="secondary" id="signout">Use another account</button></div>
</section>
<small>You are creating an OBS Creator Assistant account, not an OBS Studio account. Your devices remain isolated to your account.</small>
</main>
<script type="module">
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const supabase = createClient(${JSON.stringify(supabaseUrl)}, ${JSON.stringify(supabasePublishableKey)});
const params = new URLSearchParams(location.search);
const authorizationId = params.get('authorization_id');
const auth = document.getElementById('auth');
const consent = document.getElementById('consent');
const confirmEmail = document.getElementById('confirmEmail');
const confirmWrap = document.getElementById('confirmWrap');
const message = document.getElementById('message');
  const submitAuth = document.getElementById('submitAuth');
  const password = document.getElementById('password');
  let mode = 'signin';
  let busy = false;
  let loadingAuthorization = false;
  let authorizationHandled = false;
function show(text, kind=''){ message.className=kind; message.textContent=text; }
function setBusy(value){busy=value;submitAuth.disabled=value;document.getElementById('confirmed').disabled=value;}
function setMode(next){
  mode=next;show('');
  const signingUp=mode==='signup';
  document.getElementById('authTitle').textContent=signingUp?'Create your account':'Sign in';
  submitAuth.textContent=signingUp?'Create account and continue':'Sign in and continue';
  document.getElementById('switchMode').textContent=signingUp?'Already have an account? Sign in':'New here? Create an account';
  confirmWrap.classList.toggle('hidden',!signingUp);
  password.autocomplete=signingUp?'new-password':'current-password';
  document.getElementById('confirmPassword').required=signingUp;
}
async function load(){
  if(loadingAuthorization||authorizationHandled)return;
  if(!authorizationId){ show('Open this page from the ChatGPT connection flow.','error'); return; }
  loadingAuthorization=true;
  try{
    const { data:{ session } } = await supabase.auth.getSession();
    if(!session){ auth.classList.remove('hidden'); consent.classList.add('hidden'); return; }
    auth.classList.add('hidden');confirmEmail.classList.add('hidden');consent.classList.add('hidden');show('Checking authorization...');
    const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
    if(error){
      const expired=/no longer pending|cannot be processed|authorization not found/i.test(error.message||'');
      show(expired?'This connection has expired. Close this page and reconnect from ChatGPT.':error.message,'error');
      return;
    }
    if(data?.redirect_url&&!('authorization_id' in data)){
      authorizationHandled=true;
      show('Connected. Returning to ChatGPT...','ok');
      location.replace(data.redirect_url);
      return;
    }
    consent.classList.remove('hidden');show('');
    document.getElementById('clientName').textContent = data?.client?.name || data?.client_name || 'ChatGPT';
    const scopes = data?.scope || '';
    document.getElementById('scopeText').textContent = scopes ? 'is requesting: ' + scopes : 'is requesting access to your OBS Creator Assistant account.';
  }finally{
    loadingAuthorization=false;
  }
}
async function submit(){
  if(busy)return;
  const email=document.getElementById('email').value.trim();
  const value=password.value;
  if(!email||!value){show('Enter your email and password.','error');return;}
  if(mode==='signup'){
    const confirmation=document.getElementById('confirmPassword').value;
    if(value.length<8){show('Password must be at least 8 characters.','error');return;}
    if(value!==confirmation){show('Passwords do not match.','error');return;}
  }
  setBusy(true);show(mode==='signup'?'Creating your account...':'Signing in...');
  if(mode==='signin'){
    const { error }=await supabase.auth.signInWithPassword({email,password:value});
    setBusy(false);if(error){show(error.message,'error');return;}await load();return;
  }
  const { data,error }=await supabase.auth.signUp({email,password:value,options:{emailRedirectTo:location.href}});
  setBusy(false);if(error){show(error.message,'error');return;}
  if(data.session){await load();return;}
  auth.classList.add('hidden');confirmEmail.classList.remove('hidden');show('Account created. Confirm your email to continue.','ok');
}
document.getElementById('switchMode').onclick=()=>setMode(mode==='signin'?'signup':'signin');
submitAuth.onclick=submit;
document.querySelectorAll('#auth input').forEach(input=>input.addEventListener('keydown',event=>{if(event.key==='Enter')submit();}));
document.getElementById('confirmed').onclick=async()=>{
  setBusy(true);show('Checking your account...');
  const { data:{ session } }=await supabase.auth.getSession();
  if(session){setBusy(false);await load();return;}
  const email=document.getElementById('email').value.trim();
  const { error }=await supabase.auth.signInWithPassword({email,password:password.value});
  setBusy(false);if(error){show('Email is not confirmed yet. Open the confirmation email, then try again.','error');return;}await load();
};
supabase.auth.onAuthStateChange((_event,session)=>{if(session)load();});
document.getElementById('approve').onclick=async()=>{
  if(authorizationHandled)return;
  authorizationHandled=true;
  show('Connecting...'); const { data,error }=await supabase.auth.oauth.approveAuthorization(authorizationId);
  if(error){authorizationHandled=false;show(error.message,'error');return;} location.replace(data.redirect_url);
};
document.getElementById('deny').onclick=async()=>{
  if(authorizationHandled)return;
  authorizationHandled=true;
  const { data,error }=await supabase.auth.oauth.denyAuthorization(authorizationId);
  if(error){authorizationHandled=false;show(error.message,'error');return;} location.replace(data.redirect_url);
};
document.getElementById('signout').onclick=async()=>{await supabase.auth.signOut();location.reload();};
setMode('signin');load().catch(e=>show(e.message,'error'));
</script></body></html>`);
});

app.listen(port, "0.0.0.0", () => console.log(`OBS Creator Assistant OAuth UI listening on ${port}`));
