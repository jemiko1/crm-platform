import { Injectable, Logger } from '@nestjs/common';
import { readFileSync } from 'fs';
import { Client, ClientChannel } from 'ssh2';

/**
 * Thin client that opens an SSH session to the PBX, runs the
 * `/usr/local/sbin/crm-queue-member` helper, and reads the output.
 *
 * The helper writes queue members directly to FreePBX's `queues_details`
 * MariaDB table and runs `fwconsole reload` — the same path the FreePBX
 * GUI uses when an admin adds a member via Queues → Static Agents.
 *
 * Why ssh2 (pure JS) instead of shelling out to ssh.exe:
 *   On Windows, Node's `child_process.spawn('ssh', …)` against the
 *   bundled OpenSSH client hangs indefinitely after printing only the
 *   version banner — even with `BatchMode=yes`, `StrictHostKeyChecking`,
 *   and explicit stdio redirection. Reproduces in PM2 and direct-Node
 *   contexts. The ssh.exe process appears to wait on a console handle
 *   that doesn't exist when the parent is non-console. Rather than
 *   fight Windows console semantics, this client uses the `ssh2`
 *   npm package (pure JS, no native bindings required at runtime —
 *   `cpu-features` is an optional perf accelerator). Identical
 *   behavior on Linux + Windows + macOS.
 *
 * Why this exists at all (the architectural choice):
 *   FreePBX's REST / GraphQL APIs are READ-ONLY for queue members
 *   (verified against FreePBX 15.0.21 queues module + api 15.0.3.7).
 *   AMI `QueueAdd`/`QueueRemove` affect runtime state only; admin
 *   "Apply Config" clicks regenerate `queues.conf` from MariaDB and
 *   wipe runtime members. Direct MariaDB write via the helper is the
 *   only programmatic path that survives Apply Config.
 *
 * Feature flag `TELEPHONY_AUTO_QUEUE_SYNC` (default `true`, explicit
 * `false` disables): the wrapping `ExtensionLinkService` short-circuits
 * before calling this client when the flag is off. Kill-switch for
 * incidents.
 *
 * Environment:
 *   PBX_SSH_HOST        — PBX host or IP (default 5.10.34.153)
 *   PBX_SSH_PORT        — SSH port (default 22)
 *   PBX_SSH_USER        — SSH user (default root — existing trust path)
 *   PBX_SSH_KEY_PATH    — private key path. Default
 *                         C:\Users\Administrator\.ssh\id_rsa_asterisk
 *                         (the same key AMI bridge uses; verified live).
 *   PBX_SSH_TIMEOUT_MS  — hard timeout per command (default 70s — a
 *                         little longer than the helper's own 60s
 *                         `fwconsole reload` cap).
 *
 * Security follow-up: the SSH user defaults to `root`. A dedicated
 * `crm-sync` user with a narrow sudoers entry for
 * `/usr/local/sbin/crm-queue-member` would be tighter; tracked as a
 * future PR.
 */
@Injectable()
export class PbxQueueMemberClient {
  private readonly logger = new Logger(PbxQueueMemberClient.name);
  private readonly sshHost: string;
  private readonly sshPort: number;
  private readonly sshUser: string;
  private readonly sshKeyPath: string;
  private readonly timeoutMs: number;

  constructor() {
    this.sshHost = process.env.PBX_SSH_HOST ?? '5.10.34.153';
    this.sshPort = Number(process.env.PBX_SSH_PORT ?? 22);
    this.sshUser = process.env.PBX_SSH_USER ?? 'root';
    this.sshKeyPath =
      process.env.PBX_SSH_KEY_PATH ??
      'C:\\Users\\Administrator\\.ssh\\id_rsa_asterisk';
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
   * Validate inputs (defense-in-depth — the helper also validates), open
   * an SSH connection, run the helper, capture stdout/stderr/exit code,
   * close the connection.
   *
   * Each call opens a fresh connection. We don't pool — link/unlink runs
   * a few times per minute at most (admin-driven), and connection setup
   * is sub-200ms. A pool would add complexity (idle timeouts, half-open
   * sockets, reconnect logic) for negligible win.
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

    // Build the remote command. Inputs are regex-validated above, so they
    // contain only digits — no shell-injection surface, but ssh2 doesn't
    // shell-quote anyway; the remote sshd parses the command with sh -c
    // and we want our argv intact.
    const remoteCommand = `/usr/local/sbin/crm-queue-member ${args.join(' ')}`;

    let privateKey: Buffer;
    try {
      privateKey = readFileSync(this.sshKeyPath);
    } catch (err: any) {
      throw new Error(
        `PBX SSH key unreadable at ${this.sshKeyPath}: ${err.message}`,
      );
    }

    return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      const conn = new Client();
      let stdout = '';
      let stderr = '';
      let settled = false;

      // Hard timeout — covers connection setup + command execution +
      // graceful close. ssh2 has its own readyTimeout for the handshake
      // (we set it shorter), but doesn't have a wall-clock timeout for
      // the whole session.
      const wallClock = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          conn.end();
        } catch {
          /* ignore */
        }
        reject(
          new Error(
            `PBX queue-member ${verb} timed out after ${this.timeoutMs}ms`,
          ),
        );
      }, this.timeoutMs);

      const finishOk = () => {
        if (settled) return;
        settled = true;
        clearTimeout(wallClock);
        resolve({ stdout, stderr });
      };
      const finishErr = (err: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(wallClock);
        try {
          conn.end();
        } catch {
          /* ignore */
        }
        reject(err);
      };

      conn.on('ready', () => {
        conn.exec(remoteCommand, (execErr: Error | undefined, stream: ClientChannel) => {
          if (execErr) {
            finishErr(
              new Error(`PBX queue-member ${verb} failed: ${execErr.message}`),
            );
            return;
          }

          stream
            .on('close', (code: number | null) => {
              conn.end();
              if (code === 0) {
                finishOk();
              } else {
                this.logger.warn(
                  `PbxQueueMemberClient(${args.join(' ')}) exit=${code}: ${stderr.trim() || stdout.trim()}`,
                );
                finishErr(
                  new Error(
                    `PBX queue-member ${verb} failed (exit ${code}): ${
                      stderr.trim() || stdout.trim() || 'no output'
                    }`,
                  ),
                );
              }
            })
            .on('data', (chunk: Buffer) => {
              stdout += chunk.toString();
            });
          stream.stderr.on('data', (chunk: Buffer) => {
            stderr += chunk.toString();
          });
        });
      });

      conn.on('error', (err) => {
        finishErr(
          new Error(`PBX SSH connection failed: ${err.message}`),
        );
      });

      conn.connect({
        host: this.sshHost,
        port: this.sshPort,
        username: this.sshUser,
        privateKey,
        // Reasonable handshake timeout. The wall-clock above covers the
        // full request budget; this just stops us hanging on a dead host.
        readyTimeout: Math.min(15_000, this.timeoutMs),
      });
    });
  }
}
