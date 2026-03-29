import { Injectable, Logger } from "@nestjs/common";
import type { BugAnalysisResult } from "../ai/bug-analyzer.service";

export interface GitHubIssueResult {
  issueNumber: number;
  issueUrl: string;
}

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
    analysis: BugAnalysisResult;
  }): Promise<GitHubIssueResult | null> {
    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER || "jemiko1";
    const repo = process.env.GITHUB_REPO || "CRM-Platform";

    if (!token) {
      this.logger.warn("GITHUB_TOKEN not set — skipping issue creation");
      return null;
    }

    const { analysis } = params;

    const consoleErrors = (params.consoleLog as Array<Record<string, unknown>>).filter(
      (e) => e.level === "error",
    );
    const failedRequests = (params.networkLog as Array<Record<string, unknown>>).filter(
      (e) => typeof e.status === "number" && (e.status as number) >= 400,
    );

    const body = `## Bug Report \`${params.bugReportId.slice(0, 8)}\`

**Reported by:** ${params.reporterName} (${params.reporterEmail})
**Severity (tester):** ${params.severity}
**Severity (AI):** ${analysis.aiSeverity}
**Page:** ${params.pageUrl}
**Category:** ${params.category}
**Browser:** ${params.browserInfo.userAgent ?? "unknown"}
**Screen:** ${params.browserInfo.screenResolution ?? "unknown"}
**Timestamp:** ${params.createdAt.toISOString()}

---

### Tester Description (Original — Georgian)
${params.description}

### Tester Description (English Translation)
${analysis.testerDescriptionTranslation}

---

### AI Analysis

**Summary:** ${analysis.summary}

**Root Cause Hypothesis:**
${analysis.rootCause}

**Suggested Fix Plan:**
${analysis.suggestedFix}

**Affected Area:** ${analysis.affectedArea}
**Likely Affected Files:**
${analysis.affectedFiles.map((f) => "- `" + f + "`").join("\n")}

---

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

    const labels = [...new Set([...analysis.labels, "tester-reported"])];

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
            title: analysis.title,
            body,
            labels,
          }),
        },
      );

      if (!res.ok) {
        const errBody = await res.text();
        this.logger.error(`GitHub API error ${res.status}: ${errBody}`);
        return null;
      }

      const issue = await res.json();
      return {
        issueNumber: issue.number,
        issueUrl: issue.html_url,
      };
    } catch (err) {
      this.logger.error("GitHub issue creation failed", (err as Error).stack);
      return null;
    }
  }
}
