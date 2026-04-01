const fs = require('fs');

const envPath = 'C:/crm/backend/crm-backend/.env';
let env = fs.readFileSync(envPath, 'utf8');

// Fix COOKIE_SECURE: must be false for HTTP access
env = env.replace(/COOKIE_SECURE=true/, 'COOKIE_SECURE=false');

// Fix CORS_ORIGINS: add HTTP local access
env = env.replace(
  /CORS_ORIGINS=.*/,
  'CORS_ORIGINS=https://crm28.asg.ge,https://test.crm28.asg.ge,http://192.168.65.110:8080,http://localhost:8080'
);

fs.writeFileSync(envPath, env, 'utf8');
console.log('Fixed COOKIE_SECURE and CORS_ORIGINS');

// Verify
const updated = fs.readFileSync(envPath, 'utf8');
updated.split('\n').filter(l => l.match(/COOKIE_SECURE|CORS_ORIGINS/)).forEach(l => console.log(l.trim()));
