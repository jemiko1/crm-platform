import { Injectable, Logger } from "@nestjs/common";

export type GitHubIssueOutcome =
  | { ok: true; issueNumber: number; issueUrl: string }
  | { ok: false; error: string; status?: number };

@Injectable()
export class GitHubIssueService {
  private readonly logger = new Logger(GitHubIssueService.name);

  async createIssue(params: {
    bugReportId: string;
    reporterName: string;
    reporterEmail: string;
    severity: string;
    category: string;
    pageUrl: string;
    browserInfo: Record<string, unknown>;
    description: string;
    actionLog: unknown[];
    consoleLog: unknown[];
    networkLog: unknown[];
    createdAt: Date;
    videoUrl?: string | null;
    screenshotUrls?: string[];
  }): Promise<GitHubIssueOutcome> {
    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER || "jemiko1";
    const repo = process.env.GITHUB_REPO || "crm-platform";

    if (!token) {
      this.logger.warn("GITHUB_TOKEN not set — skipping issue creation");
      return { ok: false, error: "GITHUB_TOKEN is not configured on the server" };
    }

    const consoleErrors = (params.consoleLog as Array<Record<string, unknown>>).filter(
      (e) => e.level === "error",
    );
    const failedRequests = (params.networkLog as Array<Record<string, unknown>>).filter(
      (e) => typeof e.status === "number" && (e.status as number) >= 400,
    );

    const title = `[${params.severity}] Bug report from ${params.pageUrl}`;
    const labels = ["tester-reported", "bug", "needs-triage"];

    const body = `## Bug Report \`${params.bugReportId.slice(0, 8)}\`

**Reported by:** ${params.reporterName} (${params.reporterEmail})
**Severity:** ${params.severity}
**Page:** ${params.pageUrl}
**Category:** ${params.category}
**Browser:** ${params.browserInfo.userAgent ?? "unknown"}
**Screen:** ${params.browserInfo.screenResolution ?? "unknown"}
**Timestamp:** ${params.createdAt.toISOString()}${params.videoUrl ? `\n**Video:** [View Screen Recording](${params.videoUrl})` : ""}${params.screenshotUrls && params.screenshotUrls.length > 0 ? `\n**Screenshots:** ${params.screenshotUrls.length} attached` : ""}

---

### Tester Description
${params.description}

${params.screenshotUrls && params.screenshotUrls.length > 0 ? `---

### Screenshots

${params.screenshotUrls.map((url, i) => `![Screenshot ${i + 1}](${url})`).join("\n\n")}

` : ""}---

### Evidence

<details>
<summary>Console Errors (${consoleErrors.length} entries)</summary>

\`\`\`json
${JSON.stringify(consoleErrors.slice(0, 30), null, 2)}
\`\`\`

</details>

<details>
<summary>Failed Network Requests (${failedRequests.length} entries)</summary>

\`\`\`json
${JSON.stringify(failedRequests.slice(0, 20), null, 2)}
\`\`\`

</details>

<details>
<summary>User Action Log (${params.actionLog.length} steps)</summary>

\`\`\`json
${JSON.stringify(params.actionLog.slice(0, 60), null, 2)}
\`\`\`

</details>
`;

    try {
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/issues`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
          body: JSON.stringify({
            title,
            body,
            labels,
            assignees: [owner],
          }),
        },
      );

      if (!res.ok) {
        const errBody = await res.text();
        this.logger.error(`GitHub API error ${res.status}: ${errBody}`);
        let parsedMessage: string | null = null;
        try {
          const parsed = JSON.parse(errBody) as { message?: string };
          parsedMessage = parsed.message ?? null;
        } catch {
          /* not JSON */
        }
        const errorText =
          res.status === 401
            ? "GitHub token is invalid or expired (401). Update GITHUB_TOKEN on the server."
            : res.status === 403
              ? `GitHub denied the request (403)${parsedMessage ? ": " + parsedMessage : ""}. Token may lack \`repo\` scope or rate-limit hit.`
              : res.status === 404
                ? `GitHub repo ${owner}/${repo} not found (404). Check GITHUB_OWNER / GITHUB_REPO env vars.`
                : `GitHub API error ${res.status}${parsedMessage ? ": " + parsedMessage : ""}`;
        return { ok: false, error: errorText, status: res.status };
      }

      const issue = (await res.json()) as { number: number; html_url: string };
      return {
        ok: true,
        issueNumber: issue.number,
        issueUrl: issue.html_url,
      };
    } catch (err) {
      const message = (err as Error).message || "Unknown network error";
      this.logger.error("GitHub issue creation failed", (err as Error).stack);
      return { ok: false, error: `Network error reaching GitHub: ${message}` };
    }
  }
}
