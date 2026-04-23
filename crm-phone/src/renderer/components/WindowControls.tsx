import React, { useState } from "react";

/**
 * Single minimize button. Calls app.minimize() (taskbar) when available,
 * falls back to app.hide() (tray) if the preload hasn't been rebuilt yet.
 */
export const WindowControls: React.FC = () => {
  const [hovered, setHovered] = useState(false);

  const handleClick = () => {
    const a = window.crmPhone?.app;
    if (a?.minimize) {
      a.minimize();
    } else {
      a?.hide?.();
    }
  };

  return (
    <div style={{ WebkitAppRegion: "no-drag" as any, flexShrink: 0, height: "100%", display: "flex" }}>
      <button
        onClick={handleClick}
        title="Minimize"
        aria-label="Minimize"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: 46,
          height: "100%",
          borderRadius: 0,
          background: hovered ? "#e53935" : "transparent",
          border: "none",
          outline: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          fontSize: "13px",
          lineHeight: 1,
          color: "#fff",
          fontFamily: "Arial, sans-serif",
          transition: "background 0.12s",
        }}
      >
        ✕
      </button>
    </div>
  );
};

export const WINDOW_CONTROLS_WIDTH = 32;
