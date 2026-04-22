import React, { useState } from "react";

/**
 * Single close button — sends the window to the tray (not a real quit).
 * Styled as a rounded squircle: subtle neutral default, red on hover.
 */
export const WindowControls: React.FC = () => {
  const [hovered, setHovered] = useState(false);

  return (
    <div style={{ WebkitAppRegion: "no-drag" as any, flexShrink: 0 }}>
      <button
        onClick={() => window.crmPhone?.app?.hide?.()}
        title="Minimize to tray"
        aria-label="Close"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: 34,
          height: 22,
          borderRadius: 7,
          background: hovered ? "#e53935" : "rgba(0,0,0,0.06)",
          border: hovered ? "1px solid #c62828" : "1px solid rgba(0,0,0,0.12)",
          boxShadow: hovered
            ? "0 2px 6px rgba(229,57,53,0.35)"
            : "0 1px 2px rgba(0,0,0,0.08)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "background 0.12s, box-shadow 0.12s, border-color 0.12s",
          padding: 0,
        }}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke={hovered ? "#ffffff" : "rgba(0,0,0,0.45)"}
          strokeWidth="1.6"
          strokeLinecap="round"
        >
          <line x1="1.5" y1="1.5" x2="8.5" y2="8.5" />
          <line x1="8.5" y1="1.5" x2="1.5" y2="8.5" />
        </svg>
      </button>
    </div>
  );
};

/** Width of the control group — phantom spacer in title bars is not needed (single btn). */
export const WINDOW_CONTROLS_WIDTH = 34;
