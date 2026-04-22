import React from "react";

/**
 * CRM28 Phone — Light theme tokens (v1.11.0)
 *
 * Matches the reference design: clean white-mint paper surface with
 * the CRM's brand emerald as the single accent. Soft elevation via
 * inner + outer shadows (neumorphic feel), pill-shaped primary action,
 * bottom tab navigation.
 *
 * Brand green is `rgb(8, 117, 56)` — identical to the web CRM header.
 * Keep it that way so the softphone visually belongs to the same
 * product.
 */

// ── Brand & surfaces ──────────────────────────────────────────────

export const BRAND = "rgb(8, 117, 56)";
export const BRAND_SOFT = "rgba(8, 117, 56, 0.10)";
export const BRAND_HOVER = "rgb(10, 140, 68)";

/** Tiny bit darker for the pressed state of the primary button. */
export const BRAND_PRESSED = "rgb(6, 95, 45)";

/** Vertical gradient used on the main surface — very subtle mint
 *  wash on white so the UI never feels clinical. */
export const SURFACE_GRADIENT =
  "linear-gradient(180deg, #f4faf7 0%, #e9f3ee 100%)";

/** Flat white for cards that need to pop off the surface. */
export const SURFACE_CARD = "#ffffff";

/** Hairline dividers and subtle borders — light mint-grey. */
export const BORDER_SOFT = "rgba(15, 60, 40, 0.08)";
export const BORDER_MEDIUM = "rgba(15, 60, 40, 0.14)";

// ── Text ──────────────────────────────────────────────────────────

export const TEXT_STRONG = "#0f3c28"; // near-black emerald — primary text
export const TEXT_BODY = "#2d5543"; // darker body
export const TEXT_MUTED = "#6b8a7a"; // secondary / subtitles
export const TEXT_SUBTLE = "#9fb2a8"; // placeholders / tertiary

// ── Shadows ───────────────────────────────────────────────────────

/** Outer shadow used by cards + buttons. Kept very soft so the UI
 *  doesn't feel heavy. Two layers: tight + diffuse. */
export const SHADOW_CARD =
  "0 1px 2px rgba(15, 60, 40, 0.06), 0 4px 14px rgba(15, 60, 40, 0.06)";

export const SHADOW_CARD_HOVER =
  "0 2px 4px rgba(15, 60, 40, 0.08), 0 8px 20px rgba(15, 60, 40, 0.08)";

/** Drop-shadow for the primary Call button — tinted emerald to tie
 *  the glow back to the brand colour. */
export const SHADOW_CTA = "0 6px 16px rgba(8, 117, 56, 0.28)";

/** Danger drop-shadow for the hangup button. */
export const SHADOW_DANGER = "0 6px 16px rgba(220, 38, 38, 0.28)";

// ── Status pills ─────────────────────────────────────────────────

export const PILL_AVAILABLE: React.CSSProperties = {
  background: SURFACE_CARD,
  color: TEXT_STRONG,
  border: `1px solid ${BORDER_SOFT}`,
  boxShadow: "0 1px 2px rgba(15, 60, 40, 0.04)",
};

export const PILL_INCALL: React.CSSProperties = {
  background: BRAND_SOFT,
  color: BRAND,
  border: `1px solid rgba(8, 117, 56, 0.20)`,
};

export const PILL_BREAK: React.CSSProperties = {
  background: "rgba(245, 158, 11, 0.14)",
  color: "#9a6500",
  border: "1px solid rgba(245, 158, 11, 0.28)",
};

export const PILL_OFFLINE: React.CSSProperties = {
  background: "rgba(239, 68, 68, 0.10)",
  color: "#b91c1c",
  border: "1px solid rgba(239, 68, 68, 0.25)",
};

// ── Shared chip/card objects ─────────────────────────────────────

export const CARD: React.CSSProperties = {
  background: SURFACE_CARD,
  border: `1px solid ${BORDER_SOFT}`,
  borderRadius: 14,
  boxShadow: SHADOW_CARD,
};

/**
 * Legacy `GLASS` export kept for files that haven't been migrated to
 * the new light theme yet. Maps the old tokens onto the closest new
 * value so existing imports don't crash mid-refactor. Remove after
 * all components are converted.
 */
export const GLASS = {
  containerBackground: SURFACE_GRADIENT,
  glassCard: CARD,
  glassCardHover: { ...CARD, boxShadow: SHADOW_CARD_HOVER },
  glassSunken: {
    background: "#f1f8f4",
    border: `1px solid ${BORDER_MEDIUM}`,
  } as React.CSSProperties,
  ctaGradient: BRAND,
  ctaShadow: SHADOW_CTA,
  dangerGradient: "linear-gradient(180deg, #ef4444 0%, #dc2626 100%)",
  dangerShadow: SHADOW_DANGER,
  amberGradient: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
  successGradient: BRAND,
  successShadow: SHADOW_CTA,
  textStrong: TEXT_STRONG,
  textBody: TEXT_BODY,
  textMuted: TEXT_MUTED,
  textSubtle: TEXT_SUBTLE,
  pillOnline: PILL_INCALL,
  pillOffline: PILL_OFFLINE,
  pillDndOn: PILL_OFFLINE,
  pillDndOff: PILL_AVAILABLE,
  pillBreak: PILL_BREAK,
};
