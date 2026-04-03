Check production deployment status.
Steps:
1. SSH to VM: ssh -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110 "pm2 status"
2. Check health: curl -s https://crm28.asg.ge/health
3. gh run list --limit 3 — recent GitHub Actions deploys
4. Check monitoring dashboard: curl -s http://192.168.65.110:9090/api/status (VPN required)
5. Report: service status, any errors in PM2 logs, CI/deploy status

For staging (Railway):
1. railway link -e dev
2. railway logs -s crm-backend --lines 20
3. curl -s https://api-crm28demo.asg.ge/health
