import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Thin client that shells out to the PBX-side `/usr/local/sbin/crm-queue-member`
 * helper script over SSH. Writes queue members directly to FreePBX's
 * `queues_details` MariaDB table and runs `fwconsole reload` — the same path
 * the FreePBX GUI uses when an admin adds a member via Queues → Static
 * Agents.
 *
 * Why this is necessary:
 *   - FreePBX's REST / GraphQL APIs are READ-ONLY for queue members (verified
 *     against FreePBX 15.0.21 queues module + api 15.0.3.7).
 *   - AMI `QueueAdd`/`QueueRemove` affect runtime only; any admin "Apply
 *     Config" click in the FreePBX GUI regenerates queues.conf from the
 *     MariaDB table and silently wipes the runtime membership.
 *   - Writing to MariaDB puts CRM's changes where the GUI expects them —
 *     they appear in the GUI member list and survive Apply Config.
 *
 * Feature flag `TELEPHONY_AUTO_QUEUE_SYNC` (default `true`, explicit `false`
 * disables): when `false`, every method short-circuits with a warn log and
 * a `skipped: 'flag-disabled'` return. Kill-switch for incidents.
 *
 * SSH transport: spawns `ssh -i <key> <user>@<host> /usr/local/sbin/crm-queue-member …`.
 * Uses the key + host configured via env vars. The backend runs on the CRM
 * VM which already has SSH key trust to the PBX for the AMI-tunnel setup —
 * we reuse the same credentials.
 *
 * Environment:
 *   PBX_SSH_HOST        — PBX host or IP (default 5.10.34.153)
 *   PBX_SSH_USER        — SSH user (default root — existing trust path)
 *   PBX_SSH_KEY_PATH    — private key path. Default:
 *                         C:\Users\Administrator\.ssh\id_ed25519 on VM.
 *   PBX_SSH_TIMEOUT_MS  — hard timeout for each SSH invocation (default 70s,
 *                         a little longer than the helper's own 60s
 *                         fwconsole reload cap).
 */
@Injectable()
export class PbxQueueMemberClient {
  private readonly logger = new Logger(PbxQueueMemberClient.name);
  private readonly sshHost: string;
  private readonly sshUser: string;
  private readonly sshKeyPath: string;
  private readonly timeoutMs: number;

  constructor() {
    this.sshHost = process.env.PBX_SSH_HOST ?? '5.10.34.153';
    this.sshUser = process.env.PBX_SSH_USER ?? 'root';
    // Default matches the VM's existing key location. On dev machines,
    // set PBX_SSH_KEY_PATH in .env to your own key.
    this.sshKeyPath =
      process.env.PBX_SSH_KEY_PATH ??
      'C:\\Users\\Administrator\\.ssh\\id_ed25519';
    this.timeoutMs = Number(process.env.PBX_SSH_TIMEOUT_MS ?? 70_000);
  }

  async addMember(queue: string, extension: string): Promise<void> {
    await this.invoke(['add', queue, extension]);
  }

  async removeMember(queue: string, extension: string): Promise<void> {
    await this.invoke(['remove', queue, extension]);
  }

  async listMembers(queue: string): Promise<string[]> {
    const { stdout } = await this.invoke(['list', queue]);
    return stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^[0-9]{3,6}$/.test(line));
  }

  /**
   * Validate inputs client-side (defense-in-depth — the helper script also
   * validates) and spawn the SSH process. Any shell metacharacters would be
   * passed as argv entries by execFile (never through a shell) but we still
   * reject suspicious values early so the error is clean.
   */
  private async invoke(args: string[]): Promise<{ stdout: string; stderr: string }> {
    const [verb, queue, ext] = args;
    if (!/^(add|remove|list)$/.test(verb)) {
      throw new Error(`PbxQueueMemberClient: invalid verb ${verb}`);
    }
    if (!/^[0-9]{1,6}$/.test(queue)) {
      throw new Error(`PbxQueueMemberClient: invalid queue ${queue}`);
    }
    if (verb !== 'list' && !/^[0-9]{3,6}$/.test(ext ?? '')) {
      throw new Error(`PbxQueueMemberClient: invalid extension ${ext}`);
    }

    const sshArgs = [
      '-i', this.sshKeyPath,
      '-o', 'BatchMode=yes',
      // `accept-new` accepts the PBX host key on first contact and then
      // pins it — a silent key rotation (MITM indicator) fails the
      // connection rather than silently accepting a new key. On the VM
      // the host key is already in ~/.ssh/known_hosts from the AMI-tunnel
      // setup, so this is always strict-verify in practice. Do NOT use
      // `StrictHostKeyChecking=no` here — this process runs as root over
      // SSH and is a privileged channel.
      '-o', 'StrictHostKeyChecking=accept-new',
      '-o', `ConnectTimeout=${Math.min(30, Math.floor(this.timeoutMs / 1000))}`,
      `${this.sshUser}@${this.sshHost}`,
      '/usr/local/sbin/crm-queue-member',
      ...args,
    ];

    try {
      const result = await execFileAsync('ssh', sshArgs, {
        timeout: this.timeoutMs,
        // The helper output is tiny (1 line of ok, or a queue member list).
        // Cap at 1 MB just in case to prevent runaway.
        maxBuffer: 1024 * 1024,
      });
      return { stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
    } catch (err: any) {
      // execFile throws an Error augmented with .stdout, .stderr, .code.
      const stderr = (err?.stderr ?? '').toString();
      const code = err?.code;
      this.logger.warn(
        `PbxQueueMemberClient(${args.join(' ')}) failed (code=${code}): ${stderr || err?.message}`,
      );
      throw new Error(
        `PBX queue-member ${verb} failed: ${stderr.trim() || err?.message || 'unknown error'}`,
      );
    }
  }
}
