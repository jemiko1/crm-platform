#!/bin/bash
# ══════════════════════════════════════════════════════════
# Asterisk AMI Setup Script
# Run this on the FreePBX server via SSH as root
#
# Usage:
#   bash setup-asterisk.sh <VM_IP> <AMI_PASSWORD>
#
# Example:
#   bash setup-asterisk.sh 10.0.0.50 MyStr0ngP@ssw0rd!
# ══════════════════════════════════════════════════════════

set -euo pipefail

VM_IP="${1:?Usage: $0 <VM_IP> <AMI_PASSWORD>}"
AMI_PASS="${2:?Usage: $0 <VM_IP> <AMI_PASSWORD>}"

echo "════════════════════════════════════════════"
echo "  Asterisk AMI Setup for CRM Integration"
echo "════════════════════════════════════════════"
echo ""

# 1. Check Asterisk is running
echo "[1/6] Checking Asterisk..."
asterisk -rx "core show version" || { echo "ERROR: Asterisk not running"; exit 1; }
echo ""

# 2. Check AMI is enabled
echo "[2/6] Checking AMI status..."
AMI_ENABLED=$(grep -i "^enabled" /etc/asterisk/manager.conf | head -1)
echo "  manager.conf: $AMI_ENABLED"
if echo "$AMI_ENABLED" | grep -qi "no"; then
  echo "  WARNING: AMI appears disabled. Enable it in FreePBX Advanced Settings."
fi
echo ""

# 3. Check if crm_ami user already exists
echo "[3/6] Checking for existing crm_ami user..."
if asterisk -rx "manager show user crm_ami" 2>/dev/null | grep -q "Username"; then
  echo "  crm_ami user already exists. Updating..."
fi
echo ""

# 4. Write manager_custom.conf
echo "[4/6] Writing /etc/asterisk/manager_custom.conf..."
cat > /etc/asterisk/manager_custom.conf << CONF
[crm_ami]
secret = ${AMI_PASS}
deny = 0.0.0.0/0.0.0.0
permit = ${VM_IP}/255.255.255.255
read = cdr,reporting,call,agent
write = call,originate,agent
writetimeout = 5000
CONF
echo "  Written successfully"
echo ""

# 5. Reload AMI
echo "[5/6] Reloading AMI configuration..."
asterisk -rx "manager reload"
sleep 1
echo ""

# 6. Verify
echo "[6/6] Verifying crm_ami user..."
asterisk -rx "manager show user crm_ami"
echo ""

echo "════════════════════════════════════════════"
echo "  AMI setup complete!"
echo ""
echo "  AMI Host: $(hostname -I | awk '{print $1}')"
echo "  AMI Port: $(grep -i '^port' /etc/asterisk/manager.conf | awk '{print $3}')"
echo "  AMI User: crm_ami"
echo "  Permitted IP: ${VM_IP}"
echo ""
echo "  Test from VM:"
echo "    telnet $(hostname -I | awk '{print $1}') 5038"
echo "════════════════════════════════════════════"
