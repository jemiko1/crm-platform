import React, { useState } from "react";

/**
 * Single close-style button — minimizes to taskbar (not tray).
 * Always visible: neutral pill at rest, red on hover.
 */
export const WindowControls: React.FC = () => {
  const [hovered, setHovered] = useState(false);

  return (
    <div style={{ WebkitAppRegion: "no-drag" as any, flexShrink: 0 }}>
      <button
        onClick={() => window.crmPhone?.app?.minimize?.()}
        title="Minimize"
        aria-label="Minimize"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: 34,
          height: 22,
          borderRadius: 6,
          background: hovered ? "#e53935" : "rgba(0,0,0,0.10)",
          border: `1px solid ${hovered ? "#c62828" : "rgba(0,0,0,0.20)"}`,
          boxShadow: hovered
            ? "0 2px 6px rgba(229,57,53,0.35)"
            : "0 1px 2px rgba(0,0,0,0.10)",
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
          stroke={hovered ? "#ffffff" : "rgba(0,0,0,0.55)"}
          strokeWidth="1.7"
          strokeLinecap="round"
        >
          <line x1="1.5" y1="1.5" x2="8.5" y2="8.5" />
          <line x1="8.5" y1="1.5" x2="1.5" y2="8.5" />
        </svg>
      </button>
    </div>
  );
};

export const WINDOW_CONTROLS_WIDTH = 34;
