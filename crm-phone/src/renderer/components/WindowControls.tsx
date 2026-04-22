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
    <div style={{ WebkitAppRegion: "no-drag" as any, flexShrink: 0 }}>
      <button
        onClick={handleClick}
        title="Minimize"
        aria-label="Minimize"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: 32,
          height: 20,
          borderRadius: 5,
          background: hovered ? "#e53935" : "#e0e0e0",
          border: `1px solid ${hovered ? "#c62828" : "#bdbdbd"}`,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          fontSize: "15px",
          lineHeight: 1,
          color: hovered ? "#fff" : "#555",
          fontFamily: "Arial, sans-serif",
          transition: "background 0.1s, color 0.1s, border-color 0.1s",
        }}
      >
        ✕
      </button>
    </div>
  );
};

export const WINDOW_CONTROLS_WIDTH = 32;
