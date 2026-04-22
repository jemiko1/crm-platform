import React, { useState } from "react";

const SIZE = 12;

const BUTTONS = [
  {
    color: "#ff5f57",
    hoverIcon: "×",
    hoverColor: "rgba(100,0,0,0.50)",
    title: "Close to tray",
    label: "Close",
  },
  {
    color: "#febc2e",
    hoverIcon: "−",
    hoverColor: "rgba(80,55,0,0.50)",
    title: "Minimize to tray",
    label: "Minimize",
  },
  {
    color: "#28c840",
    hoverIcon: "+",
    hoverColor: "rgba(0,55,0,0.50)",
    title: "Hide to tray",
    label: "Hide",
  },
] as const;

/**
 * macOS-style traffic-light window controls.
 * All three call `app.hide()` — the window stays alive in the tray.
 * Hover over the group reveals icon glyphs; each dot dims slightly.
 */
export const WindowControls: React.FC = () => {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        alignItems: "center",
        WebkitAppRegion: "no-drag" as any,
        flexShrink: 0,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {BUTTONS.map(({ color, hoverIcon, hoverColor, title, label }) => (
        <button
          key={label}
          onClick={() => window.crmPhone?.app?.hide?.()}
          title={title}
          aria-label={label}
          style={{
            width: SIZE,
            height: SIZE,
            borderRadius: "50%",
            background: color,
            border: "none",
            cursor: "pointer",
            padding: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "0.5rem",
            fontWeight: 900,
            lineHeight: 1,
            color: hovered ? hoverColor : "transparent",
            transition: "filter 0.12s, color 0.12s",
            filter: hovered ? "brightness(0.88)" : "brightness(1)",
          }}
        >
          {hoverIcon}
        </button>
      ))}
    </div>
  );
};

/** Pixel width of the control group — use as phantom spacer in title bars. */
export const WINDOW_CONTROLS_WIDTH = SIZE * 3 + 6 * 2; // 48px
