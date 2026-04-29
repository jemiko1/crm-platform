const express = require('express');
const { execSync, exec } = require('child_process');
const os = require('os');
const basicAuth = require('basic-auth');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 9090;
const AUTH_USER = process.env.MONITOR_USER || 'admin';
const AUTH_PASS = process.env.MONITOR_PASS || 'crm28monitor';

// ── Basic auth middleware ────────────────────────────────
function auth(req, res, next) {
  const user = basicAuth(req);
  if (!user || user.name !== AUTH_USER || user.pass !== AUTH_PASS) {
    res.set('WWW-Authenticate', 'Basic realm="CRM Monitor"');
    return res.status(401).send('Authentication required');
  }
  next();
}

app.use(auth);
app.use(express.json());

// ── Helpers ──────────────────────────────────────────────

function ps(cmd) {
  try {
    return execSync(`powershell -Command "${cmd.replace(/"/g, '\\"')}"`, {
      encoding: 'utf8',
      timeout: 10000,
      windowsHide: true,
    }).trim();
  } catch (e) {
    return e.stderr || e.message || 'error';
  }
}

function httpCheck(url, timeout = 5000) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', (e) => resolve({ status: 0, body: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: 'timeout' }); });
  });
}

function fetchJson(url, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve({ ok: true, data: JSON.parse(data) }); }
        catch { resolve({ ok: false, error: 'Invalid JSON' }); }
      });
    });
    req.on('error', (err) => resolve({ ok: false, error: err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'Timeout' }); });
  });
}

function pm2Jlist() {
  try {
    const raw = execSync('pm2 jlist', { encoding: 'utf8', timeout: 10000, windowsHide: true });
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function readLogTail(filePath, lines = 100) {
  try {
    if (!fs.existsSync(filePath)) return `[File not found: ${filePath}]`;
    const content = fs.readFileSync(filePath, 'utf-8');
    const allLines = content.split('\n');
    return allLines.slice(-lines).join('\n');
  } catch (err) {
    return `[Error reading log: ${err.message}]`;
  }
}

function fetchGitHub(url, token) {
  return new Promise((resolve) => {
    const opts = {
      headers: {
        'User-Agent': 'CRM28-Monitor',
        'Accept': 'application/vnd.github+json',
      },
      timeout: 10000,
    };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;

    https.get(url, opts, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve({ ok: res.statusCode === 200, status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ ok: false, status: res.statusCode, error: 'Invalid JSON' }); }
      });
    }).on('error', (err) => resolve({ ok: false, error: err.message }));
  });
}

function loadGitHubToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    const envPath = 'C:\\crm\\backend\\crm-backend\\.env';
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      const match = content.match(/^GITHUB_TOKEN=(.+)$/m);
      if (match) return match[1].trim();
    }
  } catch {}
  return null;
}

// ── API: Infrastructure Status ───────────────────────────

app.get('/api/status', async (req, res) => {
  const [backendHealth, frontendHealth] = await Promise.all([
    httpCheck('http://127.0.0.1:3000/health'),
    httpCheck('http://127.0.0.1:4002'),
  ]);

  const pm2List = pm2Jlist().map((p) => ({
    name: p.name,
    status: p.pm2_env?.status || 'unknown',
    pid: p.pid,
    uptime: p.pm2_env?.pm_uptime || null,
    restarts: p.pm2_env?.restart_time || 0,
    memory: p.monit?.memory || 0,
    cpu: p.monit?.cpu || 0,
  }));

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const cpus = os.cpus();

  let pgStatus = 'unknown';
  try {
    execSync('C:\\postgresql17\\pgsql\\bin\\psql.exe -U postgres -c "SELECT 1;" -t', {
      encoding: 'utf8', timeout: 5000, windowsHide: true,
    });
    pgStatus = 'running';
  } catch { pgStatus = 'down'; }

  let nginxStatus = 'unknown';
  try {
    const svc = ps("(Get-Service nginx -ErrorAction SilentlyContinue).Status");
    nginxStatus = svc.toLowerCase().includes('running') ? 'running' : 'stopped';
  } catch {}

  let diskFree = 0, diskTotal = 0;
  try {
    const diskInfo = ps("Get-PSDrive C | Select-Object Free,Used | ConvertTo-Json");
    const disk = JSON.parse(diskInfo);
    diskFree = disk.Free;
    diskTotal = disk.Free + disk.Used;
  } catch {}

  let lastBackup = 'never';
  try {
    lastBackup = ps(
      "Get-ChildItem C:\\crm\\backups\\*.dump -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty Name"
    );
  } catch {}

  res.json({
    timestamp: new Date().toISOString(),
    system: {
      hostname: os.hostname(),
      platform: os.platform(),
      totalMemoryGB: (totalMem / 1073741824).toFixed(1),
      freeMemoryGB: (freeMem / 1073741824).toFixed(1),
      usedMemoryGB: ((totalMem - freeMem) / 1073741824).toFixed(1),
      memoryUsagePercent: (((totalMem - freeMem) / totalMem) * 100).toFixed(0),
      cpuCount: cpus.length,
      diskFreeGB: (diskFree / 1073741824).toFixed(1),
      diskTotalGB: (diskTotal / 1073741824).toFixed(1),
      uptime: os.uptime(),
    },
    services: {
      postgresql: { status: pgStatus },
      nginx: { status: nginxStatus },
      backend: {
        http: backendHealth.status === 200 ? 'healthy' : 'unhealthy',
        httpStatus: backendHealth.status,
        details: backendHealth.status === 200 ? (() => { try { return JSON.parse(backendHealth.body); } catch { return null; } })() : null,
      },
      frontend: {
        http: (frontendHealth.status >= 200 && frontendHealth.status < 400) ? 'healthy' : 'unhealthy',
        httpStatus: frontendHealth.status,
      },
    },
    pm2: pm2List,
    lastBackup,
  });
});

// ── API: Bridge Status ───────────────────────────────────

app.get('/api/bridges', async (req, res) => {
  const pm2Processes = pm2Jlist();
  const amiBridge = pm2Processes.find((p) => p.name === 'ami-bridge') || null;
  const coreBridge = pm2Processes.find((p) => p.name === 'core-sync-bridge') || null;

  const [amiHealth, coreHealth] = await Promise.all([
    fetchJson('http://127.0.0.1:3100/health'),
    fetchJson('http://127.0.0.1:3101/health'),
  ]);

  res.json({
    timestamp: new Date().toISOString(),
    bridges: {
      'ami-bridge': {
        pm2: amiBridge ? {
          status: amiBridge.pm2_env?.status || 'unknown',
          pid: amiBridge.pid,
          uptime: amiBridge.pm2_env?.pm_uptime || null,
          restarts: amiBridge.pm2_env?.restart_time || 0,
          memory: amiBridge.monit?.memory || 0,
          cpu: amiBridge.monit?.cpu || 0,
        } : null,
        health: amiHealth.ok ? amiHealth.data : { error: amiHealth.error },
      },
      'core-sync-bridge': {
        pm2: coreBridge ? {
          status: coreBridge.pm2_env?.status || 'unknown',
          pid: coreBridge.pid,
          uptime: coreBridge.pm2_env?.pm_uptime || null,
          restarts: coreBridge.pm2_env?.restart_time || 0,
          memory: coreBridge.monit?.memory || 0,
          cpu: coreBridge.monit?.cpu || 0,
        } : null,
        health: coreHealth.ok ? coreHealth.data : { error: coreHealth.error },
      },
    },
  });
});

// ── API: Bridge Logs ─────────────────────────────────────

app.get('/api/bridge-logs', (req, res) => {
  const bridge = req.query.bridge;
  const type = req.query.type || 'out';

  const logPaths = {
    'ami-bridge': {
      out: 'C:\\ami-bridge\\logs\\out.log',
      error: 'C:\\ami-bridge\\logs\\error.log',
    },
    'core-sync-bridge': {
      out: 'C:\\core-sync-bridge\\logs\\out.log',
      error: 'C:\\core-sync-bridge\\logs\\error.log',
    },
  };

  if (!logPaths[bridge]) return res.status(400).json({ error: 'Invalid bridge name' });
  if (!['out', 'error'].includes(type)) return res.status(400).json({ error: 'Invalid log type' });

  const content = readLogTail(logPaths[bridge][type], 100);
  res.type('text/plain').send(content);
});

// ── API: Bridge Action ───────────────────────────────────

app.post('/api/bridge-action', (req, res) => {
  const { bridge, action } = req.body;
  if (!['ami-bridge', 'core-sync-bridge'].includes(bridge)) {
    return res.status(400).json({ error: 'Invalid bridge name' });
  }
  if (!['restart', 'stop', 'start'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action' });
  }
  try {
    execSync(`pm2 ${action} ${bridge}`, { encoding: 'utf8', timeout: 10000, windowsHide: true });
    res.json({ ok: true, message: `${action} ${bridge}: OK` });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── API: PM2 Logs ────────────────────────────────────────

app.get('/api/logs/:service', (req, res) => {
  const { service } = req.params;
  const lines = parseInt(req.query.lines) || 50;
  const allowed = ['crm-backend', 'crm-frontend', 'ami-bridge', 'core-sync-bridge', 'bridge-monitor', 'crm-monitor'];
  if (!allowed.includes(service)) return res.status(400).json({ error: 'invalid service' });

  try {
    const logs = execSync(`pm2 logs ${service} --nostream --lines ${lines}`, {
      encoding: 'utf8', timeout: 10000, windowsHide: true,
    });
    res.json({ service, lines: logs.split('\n') });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── API: Service Action (restart/stop/start) ─────────────

app.post('/api/service/:service/:action', (req, res) => {
  const { service, action } = req.params;

  if (!['restart', 'stop', 'start'].includes(action)) {
    return res.status(400).json({ success: false, error: 'Invalid action. Use restart, stop, or start.' });
  }

  // PostgreSQL — native pg_ctl commands
  if (service === 'postgresql') {
    const pgCtl = 'C:\\postgresql17\\pgsql\\bin\\pg_ctl.exe';
    const pgData = 'C:\\postgresql17\\data';
    const pgLog = 'C:\\postgresql17\\pg.log';
    try {
      if (action === 'stop') {
        execSync(`${pgCtl} stop -D ${pgData} -m fast`, { encoding: 'utf8', timeout: 30000, windowsHide: true });
      } else if (action === 'start') {
        execSync(`${pgCtl} start -D ${pgData} -l ${pgLog}`, { encoding: 'utf8', timeout: 30000, windowsHide: true });
      } else {
        execSync(`${pgCtl} restart -D ${pgData} -l ${pgLog} -m fast`, { encoding: 'utf8', timeout: 30000, windowsHide: true });
      }
      return res.json({ success: true, message: `PostgreSQL ${action}: OK` });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  // Nginx — Windows service commands
  if (service === 'nginx') {
    const cmdMap = { stop: 'Stop-Service', start: 'Start-Service', restart: 'Restart-Service' };
    try {
      execSync(`powershell -Command "${cmdMap[action]} nginx"`, { encoding: 'utf8', timeout: 15000, windowsHide: true });
      return res.json({ success: true, message: `Nginx ${action}: OK` });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  // PM2-managed services
  const allowed = ['crm-backend', 'crm-frontend', 'ami-bridge', 'core-sync-bridge', 'bridge-monitor', 'crm-monitor'];
  if (!allowed.includes(service)) return res.status(400).json({ error: 'invalid service' });

  try {
    execSync(`pm2 ${action} ${service}`, { encoding: 'utf8', timeout: 15000, windowsHide: true });
    res.json({ success: true, message: `${service} ${action}: OK` });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Backwards-compatible restart endpoint (bridge-monitor dashboard uses this)
app.post('/api/restart/:service', (req, res) => {
  const { service } = req.params;
  const allowed = ['crm-backend', 'crm-frontend', 'ami-bridge', 'core-sync-bridge', 'bridge-monitor', 'crm-monitor', 'postgresql', 'nginx'];
  if (!allowed.includes(service)) return res.status(400).json({ error: 'invalid service' });
  // Forward internally by rewriting URL
  req.url = `/api/service/${service}/restart`;
  req.params = { service, action: 'restart' };
  app._router.handle(req, res, () => res.status(404).end());
});

// ── API: Trigger Backup ──────────────────────────────────

app.post('/api/backup', (req, res) => {
  exec(
    'C:\\postgresql17\\pgsql\\bin\\pg_dump.exe -U postgres -d crm -Fc -f C:\\crm\\backups\\manual-backup-' +
      new Date().toISOString().replace(/[:.]/g, '-') + '.dump',
    { timeout: 120000, windowsHide: true },
    (err) => {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true, message: 'Backup created' });
    }
  );
});

// ── API: Health check log ────────────────────────────────

app.get('/api/health-log', (req, res) => {
  const content = readLogTail('C:\\crm\\logs\\health-check.log', 50);
  res.type('text/plain').send(content);
});

// ── API: GitHub Deployments ──────────────────────────────

app.get('/api/github-deploys', async (req, res) => {
  const token = loadGitHubToken();
  if (!token) {
    return res.status(500).json({
      error: 'GITHUB_TOKEN not configured',
      hint: 'Set GITHUB_TOKEN in C:\\crm\\backend\\crm-backend\\.env (or in the monitor PM2 env). Token needs `repo` scope so it works once the repo flips to private.',
    });
  }
  const owner = process.env.GITHUB_OWNER || 'jemiko1';
  const repo = process.env.GITHUB_REPO || 'crm-platform';
  const workflow = process.env.GITHUB_DEPLOY_WORKFLOW || 'deploy-vm.yml';
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/runs?per_page=10`;
  const result = await fetchGitHub(url, token);
  if (!result.ok) {
    const ghMessage = (result.data && typeof result.data === 'object' && result.data.message) || result.error || null;
    let hint = null;
    if (result.status === 401) hint = 'GITHUB_TOKEN is invalid or expired — generate a new fine-grained token with `Actions: Read` + `Contents: Read` scopes and update the .env file, then restart the monitor (`pm2 restart crm-monitor`).';
    else if (result.status === 404) hint = `Repo or workflow not found at ${owner}/${repo}/${workflow}. If the repo was renamed/moved, update GITHUB_OWNER / GITHUB_REPO env vars.`;
    else if (result.status === 403) hint = 'Forbidden — token may lack `repo` scope (required for private repos) or rate-limit hit.';
    return res.status(502).json({
      error: 'GitHub API error',
      status: result.status,
      message: ghMessage,
      hint,
      url,
    });
  }
  const runs = (result.data.workflow_runs || []).map(r => ({
    id: r.id,
    status: r.status,
    conclusion: r.conclusion,
    headBranch: r.head_branch,
    commitMessage: r.head_commit?.message || '',
    commitSha: r.head_sha?.substring(0, 7) || '',
    event: r.event,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    runStartedAt: r.run_started_at,
    htmlUrl: r.html_url,
    duration: r.updated_at && r.run_started_at
      ? Math.round((new Date(r.updated_at) - new Date(r.run_started_at)) / 1000)
      : null,
  }));
  res.json({ runs, totalCount: result.data.total_count || 0 });
});

// ── API: Git Status ──────────────────────────────────────

app.get('/api/git-status', (req, res) => {
  try {
    const logRaw = execSync('git -C C:\\crm log -1 --pretty=format:"%H|%s|%ai"', {
      encoding: 'utf8', timeout: 5000, windowsHide: true,
    }).trim().replace(/^"|"$/g, '');
    const parts = logRaw.split('|');
    const branch = execSync('git -C C:\\crm branch --show-current', {
      encoding: 'utf8', timeout: 5000, windowsHide: true,
    }).trim();
    res.json({
      branch,
      commit: parts[0] || '',
      commitShort: (parts[0] || '').substring(0, 7),
      commitMessage: parts[1] || '',
      commitDate: parts[2] || '',
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Dashboard HTML ───────────────────────────────────────

app.get('/', (req, res) => {
  const html = fs.readFileSync(path.join(__dirname, 'dashboard.html'), 'utf-8');
  res.type('html').send(html);
});

// ── Start ────────────────────────────────────────────────

app.listen(PORT, '127.0.0.1', () => {
  console.log(`CRM28 Operations Dashboard: http://127.0.0.1:${PORT}`);
});
