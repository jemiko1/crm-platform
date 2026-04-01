const { execSync } = require('child_process');
const fs = require('fs');

fs.writeFileSync('C:/crm/q.sql', 'SELECT email FROM "User" WHERE "isActive" = true LIMIT 10;', 'utf8');
const result = execSync('C:/postgresql17/pgsql/bin/psql.exe -U postgres -d crm -t -A -f C:/crm/q.sql', { encoding: 'utf8' });
console.log(result.trim());
