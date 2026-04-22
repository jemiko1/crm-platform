import React from "react";

/**
 * CRM28 Phone — Glass design tokens (v1.11.0)
 *
 * Values are centralized here so a future redesign only needs to touch
 * one file. Every component imports these rather than hardcoding hex
 * strings. Keep this list short — anything that appears only once
 * stays inline.
 *
 * Design direction source: `crm-phone/design-mockups/index.html`
 * (Direction 2 — "Glass"). Dark slate base, cyan+purple radial glows,
 * frosted-glass cards.
 */

export const GLASS = {
  // Base canvas — multi-stop radial glow over a deep slate background.
  // The two glow centers sit in opposite corners (top-left cyan,
  // bottom-right purple) to create depth without competing for focus.
  containerBackground: [
    "radial-gradient(at 15% 10%, rgba(6, 182, 212, 0.28), transparent 45%)",
    "radial-gradient(at 85% 95%, rgba(139, 92, 246, 0.25), transparent 45%)",
    "#0b1120",
  ].join(", "),

  // Frosted card — translucent white over the gradient backdrop with a
  // 1px inner highlight. Used for dialpad keys, the number display,
  // the client card on in-call view, and secondary action buttons.
  //
  // `backdrop-filter` works in Electron/Chromium without any flag.
  glassCard: {
    background: "rgba(255, 255, 255, 0.08)",
    border: "1px solid rgba(255, 255, 255, 0.12)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
  } as React.CSSProperties,

  glassCardHover: {
    background: "rgba(255, 255, 255, 0.14)",
    border: "1px solid rgba(255, 255, 255, 0.18)",
  } as React.CSSProperties,

  // Deeper variant — used for inputs and any surface that should feel
  // "inset" rather than raised.
  glassSunken: {
    background: "rgba(15, 23, 42, 0.55)",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
  } as React.CSSProperties,

  // Primary gradient — the Call button. Cyan → blue, slight downward
  // shift so the highlight feels like it's catching light from above.
  ctaGradient: "linear-gradient(135deg, #06b6d4 0%, #0ea5e9 60%, #0284c7 100%)",
  ctaShadow: "0 6px 20px rgba(6, 182, 212, 0.35)",

  // Danger gradient — Hangup button.
  dangerGradient: "linear-gradient(135deg, #ef4444 0%, #dc2626 60%, #b91c1c 100%)",
  dangerShadow: "0 6px 18px rgba(220, 38, 38, 0.40)",

  // Amber gradient — Break modal timer text + on-break state accents.
  // Used with `-webkit-background-clip: text` on text elements.
  amberGradient: "linear-gradient(135deg, #fcd34d 0%, #f59e0b 100%)",

  // Success gradient — Resume button on break modal.
  successGradient: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
  successShadow: "0 6px 18px rgba(16, 185, 129, 0.35)",

  // Text colors — a 3-tier typography hierarchy.
  textStrong: "#f1f5f9", // primary labels, dial numbers, caller names
  textBody: "#cbd5e1", // secondary text
  textMuted: "#94a3b8", // tertiary, timestamps, hints
  textSubtle: "#64748b", // placeholder text, disabled

  // Accent pills — status chips that sit on the glass backdrop.
  pillOnline: {
    background: "rgba(16, 185, 129, 0.18)",
    color: "#6ee7b7",
    border: "1px solid rgba(16, 185, 129, 0.35)",
  } as React.CSSProperties,

  pillOffline: {
    background: "rgba(239, 68, 68, 0.15)",
    color: "#fca5a5",
    border: "1px solid rgba(239, 68, 68, 0.30)",
  } as React.CSSProperties,

  pillDndOn: {
    background: "rgba(239, 68, 68, 0.20)",
    color: "#fecaca",
    border: "1px solid rgba(239, 68, 68, 0.45)",
  } as React.CSSProperties,

  pillDndOff: {
    background: "rgba(148, 163, 184, 0.12)",
    color: "#cbd5e1",
    border: "1px solid rgba(148, 163, 184, 0.25)",
  } as React.CSSProperties,

  pillBreak: {
    background: "rgba(251, 191, 36, 0.16)",
    color: "#fcd34d",
    border: "1px solid rgba(251, 191, 36, 0.35)",
  } as React.CSSProperties,
};
