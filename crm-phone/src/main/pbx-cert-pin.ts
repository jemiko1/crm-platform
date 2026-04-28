import { X509Certificate, createHash } from 'node:crypto';
import { session as electronSession } from 'electron';

/**
 * Narrow TLS-cert pin for the call-center PBX.
 *
 * Background — the 2026-04-28 incident:
 *   Softphone v1.10.x had a blanket `setCertificateVerifyProc` override
 *   that returned 0 (trust) for every cert from every host. PR #292
 *   removed it correctly — that bypass turned every untrusted Wi-Fi
 *   into an active-MITM opportunity, since SIP creds + audio went over
 *   it. With strict validation, the FreePBX self-signed cert at
 *   pbx.asg.ge:8089 was rejected, all softphones lost WSS, and the
 *   entire call center went offline.
 *
 * What this module does (much narrower than the original bypass):
 *   - Trust ONE specific cert by its Subject-Public-Key-Info SHA-256
 *     hash, AND only when it's presented at the configured PBX host
 *     and port.
 *   - Anything else — different cert at the PBX (cert rotation we
 *     didn't authorize), the same cert at a different host, default
 *     Chromium validation for everything else (CRM web app, GitHub
 *     auto-updater, OpenAI quality reviews, etc.).
 *
 * Why pin SPKI rather than the full cert:
 *   - Survives cert re-issuance using the same private key. FreePBX
 *     can regenerate certificate.pem with a new validity range; as
 *     long as the underlying RSA keypair stays the same, the SPKI
 *     hash stays the same and softphones keep working with no rebuild.
 *   - If the keypair itself rotates (e.g. admin clicks "Generate new
 *     self-signed certificate" in FreePBX Cert Manager), softphones
 *     refuse the connection until a new SPKI is pinned in a release.
 *     This is intentional: a key rotation we didn't authorize is a
 *     MITM signal, not a business-as-usual update.
 *
 * Why NOT use a publicly-trusted CA cert (Let's Encrypt / ZeroSSL):
 *   - Required manual DNS-01 renewal every ~60 days because asg.ge
 *     has no API + the PBX's network blocks LE HTTP-01.
 *   - Pinning to FreePBX's own self-signed cert is good until 2036,
 *     zero ops cost, and equivalent or stronger security posture
 *     (a pinned hash cannot be coerced; a public CA can be).
 *
 * Audit posture vs PR #292's original concern:
 *   PR #292 removed "trust any cert from any host" — accepted on
 *   security grounds. This module does NOT bring that back. It does
 *   "trust THIS specific cert at THIS specific host, refuse
 *   everything else, including any other cert at the same host."
 *   That is the standard certificate-pinning pattern used by mobile
 *   banking apps, Chrome's HSTS preload, and most production VoIP
 *   clients with managed PBX endpoints.
 */

// SHA-256 of the pinned PBX cert's SubjectPublicKeyInfo, base64.
// Captured live 2026-04-28 from the FreePBX-default self-signed cert
// at /etc/asterisk/keys/integration/certificate.pem (cert valid until
// 2036-02-28). To rotate: re-capture with
//   echo | openssl s_client -connect pbx.asg.ge:8089 2>/dev/null \
//     | openssl x509 -noout -pubkey \
//     | openssl pkey -pubin -outform DER \
//     | openssl dgst -sha256 -binary \
//     | openssl enc -base64
// and update both PINNED_SPKI_SHA256 (or the second slot below) here.
//
// Pinning two slots simultaneously lets us deploy a softphone update
// BEFORE rotating the PBX cert, then rotate, then drop the old slot
// in the next release — zero downtime.
// Cert-rotation procedure:
//   1. SSH to PBX, regenerate the cert (FreePBX Cert Manager UI or
//      acme.sh), but DO NOT activate it yet.
//   2. Capture the new SPKI: `openssl x509 -in <new-cert.pem> -noout
//      -pubkey | openssl pkey -pubin -outform DER | openssl dgst
//      -sha256 -binary | openssl enc -base64`
//   3. Add the new value to the array below as a SECOND entry. Ship a
//      softphone release. Wait for operators to auto-update (the
//      auto-updater hits crm28.asg.ge so this works regardless of
//      cert state on the PBX side).
//   4. Activate the new cert on the PBX. Both old and new certs are
//      now trusted; no operator sees an outage.
//   5. After ~1 week (give stragglers time to update), drop the OLD
//      hash from the array, ship another softphone release.
const PINNED_SPKI_SHA256 = [
  // FreePBX self-signed default cert (valid until 2036-02-28).
  // Captured 2026-04-28 from /etc/asterisk/keys/integration/certificate.pem.
  'M29AQslp5wqLwEeH+qT9tYanHwDxvuRk9n/5q5pQyw8=',
  // (next-rotation slot — leave commented until step 3 of the procedure
  // above; uncomment + populate when prepping a release that bridges
  // a cert change.)
  // 'TODO_BASE64_SPKI_HASH_OF_NEXT_CERT',
];

// Hosts at which the pinned cert is the only acceptable cert.
// Anything not in this list goes through Chromium's default verifier.
//
// Note on port scope: Electron's `setCertificateVerifyProc` Request
// payload doesn't expose the destination port, only hostname. So
// pinning is per-host, not per-port — if the softphone ever opened
// a TLS connection to pbx.asg.ge:443 or any port other than 8089
// presenting a different cert, that connection would be rejected
// (because the cert wouldn't match the pin). Today the softphone
// only contacts the PBX on 8089 for WSS, so this is a no-op
// limitation. If a future feature needs port-scoped pinning, gate
// by `request.hostname` *and* the URL-path or referrer in the
// network event instead.
const PBX_HOSTS = ['pbx.asg.ge', '5.10.34.153'];

function spkiHashOf(certPem: string): string | null {
  // Note: Electron's `request.certificate.data` is documented as a PEM
  // string of the leaf cert only — even when the server presents a
  // chain, only the leaf reaches us here. `X509Certificate` parses the
  // first PEM block, which IS the leaf, so SPKI extraction is correct
  // regardless of intermediate-first ordering on the server side.
  try {
    const x = new X509Certificate(certPem);
    const der = x.publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
    return createHash('sha256').update(der).digest('base64');
  } catch {
    return null;
  }
}

/**
 * Install on the default Electron session. Call once during
 * `app.whenReady`, before any window is created.
 *
 * Decision matrix per request:
 *   host not in PBX_HOSTS  → callback(-3)  use Chromium default verifier
 *   host in PBX_HOSTS,
 *     SPKI matches a pin   → callback(0)   trust the connection
 *     SPKI does not match  → callback(-2)  explicitly reject + log
 *
 * The -2 path is the alarm: it indicates either a legitimate cert
 * rotation we forgot to ship a new pin for, or an active MITM. Either
 * way, refuse the connection and surface in logs.
 */
export function installPbxCertPin(opts?: { logger?: (msg: string) => void }) {
  const log = opts?.logger ?? ((m) => console.log(`[cert-pin] ${m}`));

  // Pin is attached to defaultSession ONLY. Today the renderer's SIP.js
  // client uses defaultSession for its WSS connection, so this covers
  // every WSS handshake. If a future feature creates a partitioned
  // session (e.g. session.fromPartition('persist:pbx')), it will NOT
  // inherit this pin — call installPbxCertPin again on the new session,
  // or refactor to install on every session created.
  electronSession.defaultSession.setCertificateVerifyProc(
    (request, callback) => {
      const { hostname, certificate, verificationResult, errorCode } = request;

      if (!PBX_HOSTS.includes(hostname)) {
        // Not the PBX endpoint — let Chromium's normal verifier decide.
        // -3 = use default verification result. This is what every other
        // HTTPS connection (CRM web app, GitHub releases, OpenAI, etc.)
        // hits, and it does the right thing: trust public CAs, reject
        // everything else.
        return callback(-3);
      }

      const spki = spkiHashOf(certificate.data);
      if (!spki) {
        log(`PBX ${hostname} — could not parse cert; refusing`);
        return callback(-2);
      }

      if (PINNED_SPKI_SHA256.includes(spki)) {
        // Trust the pinned cert. We DO NOT log this every time — it
        // happens hundreds of times per session as WSS reconnects on
        // network blips. Once is enough at startup.
        return callback(0);
      }

      log(
        `PBX ${hostname} presented UNEXPECTED cert ` +
          `(spki=${spki}, chromium-verify=${verificationResult}, ` +
          `errorCode=${errorCode}). Refusing — either FreePBX cert was ` +
          `rotated without a softphone release update, or this is a MITM.`,
      );
      return callback(-2);
    },
  );

  log(
    `installed for hosts=[${PBX_HOSTS.join(',')}], ` +
      `${PINNED_SPKI_SHA256.length} pinned SPKI fingerprint(s)`,
  );
}
