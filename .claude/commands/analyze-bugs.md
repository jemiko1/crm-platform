Analyze unreviewed bug reports from GitHub issues.

Steps:
1. Run: `gh issue list --repo jemiko1/CRM-Platform --label "tester-reported" --label "needs-triage" --state open --json number,title,body,labels,createdAt --limit 20`
2. For each issue found:
   a. Read the full issue body — it contains: tester description (may be in Georgian), console errors, failed network requests, user action log, page URL, browser info
   b. Analyze the bug report data and produce a structured analysis:
      - Translate the Georgian description to English
      - Identify the root cause based on console errors, failed API calls, and user actions
      - Map the page URL and API endpoints to likely affected files using NestJS/Next.js conventions from this codebase
      - Suggest a concrete fix plan
      - Assess severity (CRITICAL/HIGH/MEDIUM/LOW) based on evidence
   c. Post your analysis as a comment on the issue using:
      ```
      gh issue comment {number} --repo jemiko1/CRM-Platform --body "## AI Analysis

      **English Translation:** {translation of Georgian description}

      **Summary:** {2-3 sentence summary}

      **Root Cause Hypothesis:**
      {your analysis referencing specific endpoints, components, error traces}

      **Suggested Fix Plan:**
      {step-by-step fix plan}

      **Affected Area:** {e.g. Work Orders, Sales, Inventory}
      **Likely Affected Files:**
      {list of file paths based on codebase conventions}

      **AI Severity Assessment:** {CRITICAL|HIGH|MEDIUM|LOW}

      ---
      _Analyzed by Claude Code_"
      ```
   d. Remove the "needs-triage" label and add "ai-analyzed":
      `gh issue edit {number} --repo jemiko1/CRM-Platform --remove-label "needs-triage" --add-label "ai-analyzed"`
3. Report summary: how many issues analyzed, key findings
4. If no issues found with "needs-triage" label, report "No new bug reports to analyze"
