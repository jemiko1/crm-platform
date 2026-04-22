import React, { useState } from "react";

type BtnConfig = {
  icon: string;
  title: string;
  label: string;
  isClose?: boolean;
};

const BUTTONS: BtnConfig[] = [
  { icon: "−", title: "Minimize to tray", label: "Minimize" },
  { icon: "□", title: "Hide to tray",     label: "Maximize" },
  { icon: "×", title: "Close to tray",    label: "Close", isClose: true },
];

/**
 * Windows-style window controls — minimize, maximize, close.
 * All three call `app.hide()` so the window stays alive in the tray.
 * Close gets a red hover; min/max get a neutral grey hover.
 */
export const WindowControls: React.FC = () => {
  const [activeBtn, setActiveBtn] = useState<string | null>(null);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        WebkitAppRegion: "no-drag" as any,
        flexShrink: 0,
        height: "100%",
      }}
    >
      {BUTTONS.map(({ icon, title, label, isClose }) => {
        const isHov = activeBtn === label;
        return (
          <button
            key={label}
            onClick={() => window.crmPhone?.app?.hide?.()}
            title={title}
            aria-label={label}
            onMouseEnter={() => setActiveBtn(label)}
            onMouseLeave={() => setActiveBtn(null)}
            style={{
              width: isClose ? 34 : 28,
              height: "100%",
              background: isHov
                ? isClose
                  ? "#c42b1c"
                  : "rgba(0,0,0,0.07)"
                : "transparent",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: isClose ? "1rem" : "0.85rem",
              lineHeight: 1,
              color: isHov && isClose ? "#ffffff" : "rgba(30,30,30,0.55)",
              transition: "background 0.1s, color 0.1s",
              padding: 0,
              borderRadius: 0,
            }}
          >
            {icon}
          </button>
        );
      })}
    </div>
  );
};

/** Total width: 28 + 28 + 34 = 90px. */
export const WINDOW_CONTROLS_WIDTH = 28 + 28 + 34; // 90px
