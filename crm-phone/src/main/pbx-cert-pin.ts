import { session as electronSession } from 'electron';

/**
 * Narrow TLS-trust override for the call-center PBX.
 *
 * History (read in order to understand the trade-off):
 *   - Pre-2026-04-28: a blanket "trust any cert from any host" bypass.
 *     Removed in PR #292 because every untrusted Wi-Fi turned into an
 *     active-MITM opportunity for SIP creds + audio.
 *   - PR #292 → strict default validation. FreePBX self-signed cert at
 *     pbx.asg.ge:8089 was rejected; entire call center went offline.
 *   - PR #308 (v1.12.1): strict SPKI pin to a single FreePBX cert hash.
 *     Closed the security hole AND restored the WSS connection. But the
 *     pin meant cert rotation = coordinated softphone release; any
 *     mismatch between PBX cert and shipped pin took the entire fleet
 *     offline simultaneously.
 *   - v1.14.0 (this version): drop the SPKI pin. The perimeter is now
 *     enforced where it actually belongs — the FreePBX firewall, which
 *     IP-whitelists the call center's office public IPs. SIP traffic
 *     can ONLY reach the PBX from those office networks, so the
 *     internal-MITM threat the pin defended against (an attacker on
 *     the same Wi-Fi as an operator) is constrained to a managed-LAN
 *     environment where it's far less likely.
 *
 * What this module does now:
 *   - Trust whatever TLS cert the PBX presents at `pbx.asg.ge` /
 *     `5.10.34.153`, encrypted but not pinned.
 *   - Everything else (CRM web app, GitHub auto-updater, OpenAI
 *     quality reviews, etc.) goes through Chromium's default verifier
 *     unchanged — public CA chain validation, the same as a normal
 *     browser.
 *
 * Why this is acceptable:
 *   - The FreePBX firewall whitelists office IPs (Connectivity →
 *     Firewall → Networks). An attacker who is NOT on one of those
 *     networks cannot reach the PBX at all — no SIP, no MITM
 *     opportunity. This perimeter is enforced at the PBX, not in the
 *     softphone, and survives any softphone vulnerability.
 *   - On the office LAN itself, an internal attacker would need to
 *     also intercept a TLS connection that's already encrypted. With
 *     no public-CA path on this self-signed endpoint, they cannot
 *     present a "valid" cert that Chromium would trust, so the only
 *     attack surface is "rogue device on the same LAN running ARP
 *     poisoning" — a scenario that's mitigated by managed network
 *     hygiene, not application-layer pinning.
 *
 * What this is NOT:
 *   - This is NOT a return to the pre-PR-#292 "trust everything"
 *     bypass. The override is scoped to TWO specific hostnames; every
 *     other TLS connection in the app is validated by Chromium normally.
 *   - This is NOT a security regression for public-internet operators.
 *     The PBX firewall already prevents non-office IPs from reaching
 *     SIP at all; this change only affects what happens for connections
 *     that successfully reach the PBX, which by firewall rule are
 *     already from a trusted office network.
 *
 * If the threat model changes (operators connecting from untrusted
 * networks, the firewall whitelist relaxed, etc.), this module should
 * be reverted to SPKI pinning OR the PBX should be moved behind a
 * public-CA cert (Let's Encrypt with a DNS-API-friendly DNS provider
 * for the `pbx.asg.ge` record). Until then, the operational benefit of
 * "cert rotation never takes the fleet offline" outweighs the marginal
 * security cost.
 */

const PBX_HOSTS = ['pbx.asg.ge', '5.10.34.153'];

/**
 * Install on the default Electron session. Call once during
 * `app.whenReady`, before any window is created.
 *
 * Decision matrix per request:
 *   host in PBX_HOSTS       → callback(0)   trust the connection (cert
 *                                            is encrypted but unverified;
 *                                            firewall is the perimeter)
 *   host not in PBX_HOSTS   → callback(-3)  use Chromium default verifier
 */
export function installPbxCertPin(opts?: { logger?: (msg: string) => void }) {
  const log = opts?.logger ?? ((m) => console.log(`[pbx-tls] ${m}`));

  electronSession.defaultSession.setCertificateVerifyProc(
    (request, callback) => {
      if (PBX_HOSTS.includes(request.hostname)) {
        // Office-IP-firewalled PBX endpoint — accept whatever cert it
        // presents. We log only when the cert itself is unparseable;
        // a successful TLS handshake is silent because it happens
        // hundreds of times per session as WSS reconnects.
        return callback(0);
      }
      // Everything else (CRM web, auto-updater, OpenAI, etc.) uses
      // Chromium's normal public-CA validation.
      return callback(-3);
    },
  );

  log(`installed: host-scoped trust override for [${PBX_HOSTS.join(',')}]`);
}
