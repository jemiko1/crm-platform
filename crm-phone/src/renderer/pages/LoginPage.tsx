import React, { useState } from "react";

interface Props {
  onLogin: (email: string, password: string) => Promise<void>;
  loading: boolean;
  error: string | null;
}

export function LoginPage({ onLogin, loading, error }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onLogin(email, password);
  };

  return (
    <div style={styles.container}>
      <div style={styles.logo}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
          <path
            d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.97.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.84.57 2.81.7A2 2 0 0 1 22 16.92Z"
            stroke="#60a5fa"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
        <h1 style={styles.title}>CRM Phone</h1>
        <p style={styles.subtitle}>Sign in with your CRM account</p>
      </div>

      <form onSubmit={handleSubmit} style={styles.form}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={styles.input}
          autoFocus
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={styles.input}
        />

        {error && <div style={styles.error}>{error}</div>}

        <button type="submit" disabled={loading} style={styles.button}>
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100vh",
    padding: "2rem",
    background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
  },
  logo: {
    textAlign: "center",
    marginBottom: "2rem",
  },
  title: {
    fontSize: "1.5rem",
    fontWeight: 700,
    color: "#f1f5f9",
    marginTop: "0.75rem",
  },
  subtitle: {
    fontSize: "0.875rem",
    color: "#94a3b8",
    marginTop: "0.25rem",
  },
  form: {
    width: "100%",
    maxWidth: "300px",
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
  },
  input: {
    width: "100%",
    padding: "0.75rem 1rem",
    borderRadius: "0.5rem",
    border: "1px solid #334155",
    background: "#1e293b",
    color: "#f1f5f9",
    fontSize: "0.9rem",
    outline: "none",
  },
  error: {
    padding: "0.5rem 0.75rem",
    borderRadius: "0.375rem",
    background: "#7f1d1d33",
    border: "1px solid #dc2626",
    color: "#fca5a5",
    fontSize: "0.8rem",
  },
  button: {
    width: "100%",
    padding: "0.75rem",
    borderRadius: "0.5rem",
    border: "none",
    background: "#3b82f6",
    color: "#fff",
    fontSize: "0.9rem",
    fontWeight: 600,
    cursor: "pointer",
    marginTop: "0.25rem",
  },
};
