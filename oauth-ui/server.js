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
:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#202020;background:#f4f4f4}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px}main{width:min(560px,100%);background:#fff;border:1px solid #ddd;border-radius:20px;padding:32px;box-shadow:0 14px 45px rgba(0,0,0,.08)}h1{margin:0 0 8px}p{color:#555;line-height:1.5}label{display:block;margin:14px 0 6px;font-weight:650}input{width:100%;padding:12px;border:1px solid #ccc;border-radius:9px;font:inherit}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}button{border:0;border-radius:10px;padding:12px 18px;font:inherit;cursor:pointer}.primary{background:#1f1f1f;color:#fff}.secondary{background:#eee;color:#1f1f1f}.danger{background:#f4e8e8;color:#7b2020}.card{padding:16px;background:#f7f7f7;border-radius:12px;margin:18px 0}.hidden{display:none}.error{color:#9b1c1c}.ok{color:#176b37}small{color:#777;display:block;margin-top:18px;line-height:1.45}</style>
</head>
<body><main>
<h1>OBS Creator Assistant</h1>
<p id="intro">Sign in to connect ChatGPT to your own OBS computers.</p>
<div id="message"></div>
<section id="auth">
<label>Email</label><input id="email" type="email" autocomplete="email">
<label>Password</label><input id="password" type="password" autocomplete="current-password">
<div class="actions"><button class="primary" id="signin">Sign in</button><button class="secondary" id="signup">Create account</button></div>
</section>
<section id="consent" class="hidden">
<div class="card"><strong id="clientName">ChatGPT</strong><p id="scopeText">is requesting access to control only the OBS computers paired to your account.</p></div>
<div class="actions"><button class="primary" id="approve">Allow</button><button class="danger" id="deny">Deny</button><button class="secondary" id="signout">Use another account</button></div>
</section>
<small>Your OBS devices are isolated by account ownership. Authorization does not grant access to another creator's computer.</small>
</main>
<script type="module">
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const supabase = createClient(${JSON.stringify(supabaseUrl)}, ${JSON.stringify(supabasePublishableKey)});
const params = new URLSearchParams(location.search);
const authorizationId = params.get('authorization_id');
const auth = document.getElementById('auth');
const consent = document.getElementById('consent');
const message = document.getElementById('message');
function show(text, kind=''){ message.className=kind; message.textContent=text; }
async function load(){
  if(!authorizationId){ show('This page must be opened from the ChatGPT Connect flow.','error'); return; }
  const { data:{ session } } = await supabase.auth.getSession();
  if(!session){ auth.classList.remove('hidden'); consent.classList.add('hidden'); return; }
  auth.classList.add('hidden'); consent.classList.remove('hidden');
  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if(error){ show(error.message,'error'); return; }
  document.getElementById('clientName').textContent = data?.client?.name || data?.client_name || 'ChatGPT';
  const scopes = data?.scope || '';
  document.getElementById('scopeText').textContent = scopes ? 'is requesting: ' + scopes : 'is requesting access to your OBS Creator Assistant account.';
}
document.getElementById('signin').onclick=async()=>{
  show('Signing in...');
  const { error }=await supabase.auth.signInWithPassword({email:email.value,password:password.value});
  if(error){show(error.message,'error');return;} show('Signed in.','ok'); await load();
};
document.getElementById('signup').onclick=async()=>{
  show('Creating account...');
  const { data,error }=await supabase.auth.signUp({email:email.value,password:password.value});
  if(error){show(error.message,'error');return;}
  if(!data.session){show('Account created. Confirm your email, then restart the ChatGPT Connect flow.','ok');return;}
  await load();
};
document.getElementById('approve').onclick=async()=>{
  show('Connecting...'); const { data,error }=await supabase.auth.oauth.approveAuthorization(authorizationId);
  if(error){show(error.message,'error');return;} location.href=data.redirect_url;
};
document.getElementById('deny').onclick=async()=>{
  const { data,error }=await supabase.auth.oauth.denyAuthorization(authorizationId);
  if(error){show(error.message,'error');return;} location.href=data.redirect_url;
};
document.getElementById('signout').onclick=async()=>{await supabase.auth.signOut();location.reload();};
load().catch(e=>show(e.message,'error'));
</script></body></html>`);
});

app.listen(port, "0.0.0.0", () => console.log(`OBS Creator Assistant OAuth UI listening on ${port}`));
