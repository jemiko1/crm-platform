"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/hooks/useI18n";

const LANGUAGES = [
  { code: "en" as const, label: "English", flag: "🇬🇧" },
  { code: "ka" as const, label: "ქართული", flag: "🇬🇪" },
];

const BRIDGE_URL = "http://127.0.0.1:19876";

type PhoneAppState = {
  detected: boolean;
  loggedIn: boolean;
  userName: string | null;
  extension: string | null;
  sipRegistered: boolean;
};

export default function HeaderSettings() {
  const { language, setLanguage, t } = useI18n();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const [phoneApp, setPhoneApp] = useState<PhoneAppState>({
    detected: false, loggedIn: false, userName: null, extension: null, sipRegistered: false,
  });

  const checkPhoneApp = useCallback(async () => {
    try {
      const res = await fetch(`${BRIDGE_URL}/status`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        const data = await res.json();
        setPhoneApp({
          detected: true,
          loggedIn: !!data.loggedIn,
          userName: data.user?.name ?? null,
          extension: data.user?.extension ?? null,
          sipRegistered: !!data.sipRegistered,
        });
      } else {
        setPhoneApp({ detected: false, loggedIn: false, userName: null, extension: null, sipRegistered: false });
      }
    } catch {
      setPhoneApp({ detected: false, loggedIn: false, userName: null, extension: null, sipRegistered: false });
    }
  }, []);

  useEffect(() => {
    checkPhoneApp();
    const interval = setInterval(checkPhoneApp, 30_000);
    return () => clearInterval(interval);
  }, [checkPhoneApp]);

  useEffect(() => {
    if (open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        className={`relative w-10 h-10 flex items-center justify-center rounded-full transition-colors ${
          open
            ? "bg-teal-100 text-teal-800"
            : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
        }`}
        title={t("settings.title", "Settings")}
      >
        <svg className="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>

      {open &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-[60000] w-[240px] bg-white rounded-2xl shadow-2xl border border-zinc-200/80 overflow-hidden"
            style={{ top: pos.top, right: pos.right }}
          >
            <div className="px-4 py-3 border-b border-zinc-100">
              <h3 className="text-sm font-semibold text-zinc-900">
                {t("settings.language", "Language")}
              </h3>
            </div>

            <div className="p-2">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => {
                    setLanguage(lang.code);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                    language === lang.code
                      ? "bg-teal-50 text-teal-900 font-medium"
                      : "text-zinc-700 hover:bg-zinc-50"
                  }`}
                >
                  <span className="text-xl leading-none">{lang.flag}</span>
                  <span>{lang.label}</span>
                  {language === lang.code && (
                    <svg className="w-4 h-4 ml-auto text-teal-800" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              ))}
            </div>

            {/* Phone App Section */}
            <div className="border-t border-zinc-100">
              <div className="px-4 py-3 border-b border-zinc-100">
                <h3 className="text-sm font-semibold text-zinc-900">
                  {t("settings.phoneApp", "Phone App")}
                </h3>
              </div>

              <div className="p-2">
                {phoneApp.detected && phoneApp.loggedIn ? (
                  <div className="px-3 py-2.5 rounded-xl bg-teal-50">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full shrink-0 ${phoneApp.sipRegistered ? "bg-teal-500" : "bg-amber-500"}`} />
                      <span className="text-sm font-medium text-teal-900">
                        {t("settings.phoneConnected", "Connected")}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2 text-xs text-teal-900">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.97.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.84.57 2.81.7A2 2 0 0 1 22 16.92Z" />
                      </svg>
                      <span>Ext {phoneApp.extension}</span>
                      <span className="text-teal-800/60">|</span>
                      <span>{phoneApp.sipRegistered ? t("settings.sipRegistered", "SIP Registered") : t("settings.sipOffline", "SIP Offline")}</span>
                    </div>
                    {phoneApp.userName && (
                      <div className="mt-1 text-xs text-teal-800">{phoneApp.userName}</div>
                    )}
                  </div>
                ) : phoneApp.detected ? (
                  <div className="px-3 py-2.5 rounded-xl bg-amber-50">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
                      <span className="text-sm font-medium text-amber-800">
                        {t("settings.phoneNotLoggedIn", "App running, not logged in")}
                      </span>
                    </div>
                  </div>
                ) : (
                  <a
                    href="https://github.com/jemiko1/crm-platform/releases/download/v1.5.4/CRM28-Phone-Setup-1.5.4.exe"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-zinc-700 hover:bg-zinc-50 transition-colors"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    <div>
                      <div className="font-medium">{t("settings.downloadPhoneApp", "Download Phone App")}</div>
                      <div className="text-xs text-zinc-400">{t("settings.downloadPhoneAppDesc", "Windows softphone for calls")}</div>
                    </div>
                  </a>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
