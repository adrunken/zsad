async function g(){await fetch('/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:p.value})});reload()}
async function u(){const r=await fetch('/publish',{method:'POST'});load()}
async function load(){const r=await fetch('/history');const h=await r.json();v.innerHTML=h.map(x=>`<option>${x}</option>`).join('')}
async function r(){await fetch('/rollback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:v.value})});reload()}
function reload(){document.querySelector('iframe').src='/site/live.html?t='+Date.now()}
load()