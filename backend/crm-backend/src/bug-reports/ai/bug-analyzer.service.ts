import { Injectable, Logger } from "@nestjs/common";

export interface BugAnalysisResult {
  title: string;
  summary: string;
  rootCause: string;
  suggestedFix: string;
  affectedArea: string;
  affectedFiles: string[];
  labels: string[];
  aiSeverity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  testerDescriptionTranslation: string;
}

const SYSTEM_PROMPT = `You are a senior QA engineer and debugger analyzing a bug report from a CRM application (NestJS + Next.js + Prisma + PostgreSQL + Socket.IO).

The tester's description may be in Georgian language — read and understand it fully.

Analyze the provided data (user actions, console errors, network failures, page URL) and produce a structured analysis.

Respond ONLY in valid JSON with this exact structure:
{
  "title": "Brief English title for GitHub issue (max 80 chars)",
  "summary": "2-3 sentence English description of the bug based on all evidence",
  "rootCause": "Your hypothesis of what's causing this — reference specific API endpoints, components, or patterns you can infer from the logs",
  "suggestedFix": "Step-by-step fix plan that a developer can follow",
  "affectedArea": "Which part of the app: e.g. 'Work Orders', 'Sales Pipeline', 'Inventory', 'Auth', 'Telephony', etc.",
  "affectedFiles": ["List of likely file paths based on the URL pattern, API calls, and error traces — use NestJS/Next.js conventions"],
  "labels": ["Array of GitHub labels to apply, e.g. 'bug', 'frontend', 'backend', 'api', 'database', 'ui', 'critical', 'performance'"],
  "aiSeverity": "CRITICAL | HIGH | MEDIUM | LOW — your assessment based on the evidence, may differ from tester's pick",
  "testerDescriptionTranslation": "English translation of the tester's Georgian description"
}`;

@Injectable()
export class BugAnalyzerService {
  private readonly logger = new Logger(BugAnalyzerService.name);

  async analyze(data: {
    description: string;
    pageUrl: string;
    browserInfo: unknown;
    actionLog: unknown[];
    consoleLog: unknown[];
    networkLog: unknown[];
  }): Promise<BugAnalysisResult | null> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      this.logger.warn("ANTHROPIC_API_KEY not set — skipping AI analysis");
      return null;
    }

    const userMessage = [
      `## Tester Description\n${data.description}`,
      `## Page URL\n${data.pageUrl}`,
      `## Browser Info\n${JSON.stringify(data.browserInfo, null, 2)}`,
      `## Console Log (${data.consoleLog.length} entries)\n${JSON.stringify(data.consoleLog.slice(0, 50), null, 2)}`,
      `## Network Log (${data.networkLog.length} entries)\n${JSON.stringify(data.networkLog.slice(0, 50), null, 2)}`,
      `## Action Log (${data.actionLog.length} steps)\n${JSON.stringify(data.actionLog.slice(0, 80), null, 2)}`,
    ].join("\n\n");

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2048,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userMessage }],
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        this.logger.error(`Claude API error ${res.status}: ${body}`);
        return null;
      }

      const json = await res.json();
      const text: string = json.content?.[0]?.text ?? "";

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        this.logger.error("Could not extract JSON from Claude response");
        return null;
      }

      return JSON.parse(jsonMatch[0]) as BugAnalysisResult;
    } catch (err) {
      this.logger.error("AI analysis failed", (err as Error).stack);
      return null;
    }
  }
}
