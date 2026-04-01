const { execSync } = require('child_process');
const fs = require('fs');

// Check backend .env
try {
  const env = fs.readFileSync('C:/crm/backend/crm-backend/.env', 'utf8');
  const lines = env.split('\n').filter(l =>
    l.match(/COOKIE|CORS|NEXT_PUBLIC|PORT|JWT_EXPIRES/i) && !l.match(/SECRET|PASSWORD/i)
  );
  console.log('=== Backend .env (relevant) ===');
  lines.forEach(l => console.log(l.trim()));
} catch(e) { console.log('Backend .env error:', e.message); }

// Check frontend .env
console.log('\n=== Frontend .env.local ===');
try {
  const env = fs.readFileSync('C:/crm/frontend/crm-frontend/.env.local', 'utf8');
  console.log(env.trim());
} catch(e) { console.log('Not found:', e.message); }

// Test login and check response headers
console.log('\n=== Login response headers ===');
const http = require('http');
const data = JSON.stringify({email:'admin@crm.local',password:'Admin123!'});
const opts = {hostname:'127.0.0.1',port:3000,path:'/auth/login',method:'POST',headers:{'Content-Type':'application/json','Content-Length':data.length}};
const req = http.request(opts, r => {
  console.log('Status:', r.statusCode);
  console.log('Set-Cookie:', r.headers['set-cookie']);
  let body = '';
  r.on('data', c => body += c);
  r.on('end', () => console.log('Body:', body.substring(0, 200)));
});
req.write(data);
req.end();
