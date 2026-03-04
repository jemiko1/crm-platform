# Security Policy

## Reporting a Vulnerability

**Do not include secrets, API keys, or passwords in any report.**

If you discover a security vulnerability:

1. **Do not** open a public issue.
2. Contact the repository maintainers privately (e.g., via email or secure channel).
3. Provide a clear description of the vulnerability and steps to reproduce.
4. Allow time for a fix before any public disclosure.

## Security Practices

- Secrets (API keys, tokens, passwords) are stored in environment variables, not in code.
- `.env` files are gitignored; use `.env.example` for structure only.
- Do not commit credentials or sensitive data.
