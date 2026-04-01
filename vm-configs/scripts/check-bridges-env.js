const fs = require('fs');

console.log('=== AMI Bridge .env ===');
try {
  const env = fs.readFileSync('C:/ami-bridge/.env', 'utf8');
  env.split('\n').filter(l => l.trim() && !l.startsWith('#')).forEach(l => {
    // Hide secrets
    if (l.match(/SECRET|PASSWORD/i)) {
      const [key] = l.split('=');
      console.log(key + '=***');
    } else {
      console.log(l.trim());
    }
  });
} catch(e) { console.log('Error:', e.message); }

console.log('\n=== Core Sync Bridge .env ===');
try {
  const env = fs.readFileSync('C:/core-sync-bridge/.env', 'utf8');
  env.split('\n').filter(l => l.trim() && !l.startsWith('#')).forEach(l => {
    if (l.match(/SECRET|PASSWORD/i)) {
      const [key] = l.split('=');
      console.log(key + '=***');
    } else {
      console.log(l.trim());
    }
  });
} catch(e) { console.log('Error:', e.message); }

console.log('\n=== Backend CRM_BASE_URL / webhook config ===');
try {
  const env = fs.readFileSync('C:/crm/backend/crm-backend/.env', 'utf8');
  env.split('\n').filter(l => l.match(/WEBHOOK|BASE_URL|TELEPHONY/i) && !l.match(/SECRET|PASSWORD/i)).forEach(l => console.log(l.trim()));
} catch(e) { console.log('Error:', e.message); }
