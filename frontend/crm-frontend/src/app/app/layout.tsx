import type { ReactNode } from "react";
import SidebarNav from "./sidebar-nav";
import AppHeader from "./app-header";
import { ModalStackWrapper } from "./modal-provider";
import { MessengerProvider } from "./messenger/messenger-context";
import ChatBubbleContainer from "./messenger/chat-bubble-container";
import MessengerModalBridge from "./messenger/messenger-modal-bridge";
import { I18nProvider } from "@/contexts/i18n-context";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
    <MessengerProvider>
    <ModalStackWrapper>
      <div className="min-h-dvh min-h-screen relative">
        {/* App background - hidden on mobile to maximize content space */}
        <div className="hidden lg:block fixed inset-0 -z-10">
          <div className="fixed inset-0 bg-gradient-to-br from-emerald-200 via-emerald-100 to-slate-200" />
          <div className="fixed inset-0 bg-slate-900/12" />
          <div className="fixed -top-24 -left-24 h-80 w-80 rounded-full bg-emerald-500/30 blur-3xl" />
          <div className="fixed top-24 -right-24 h-96 w-96 rounded-full bg-emerald-600/25 blur-3xl" />
          <div className="fixed -bottom-24 left-1/3 h-96 w-96 rounded-full bg-slate-600/20 blur-3xl" />
          <div className="fixed inset-0 opacity-[0.22] bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.22)_1px,transparent_0)] bg-[length:22px_22px]" />
        </div>
        {/* Mobile background - solid when decorative is hidden */}
        <div className="lg:hidden fixed inset-0 bg-zinc-50 -z-10" />

        {/* Full-width sticky header */}
        <AppHeader />

        {/* Below header: sidebar + content */}
        <div className="relative w-full">
          <div className="flex">
            {/* Left Rail Sidebar - starts below the header */}
            <aside className="hidden lg:block fixed left-4 top-[68px] bottom-6 w-[108px] shrink-0 z-40">
              <div className="h-full">
                <div className="h-full rounded-[32px] bg-white/85 backdrop-blur-xl border border-white/60 shadow-[0_10px_40px_rgba(0,0,0,0.3),0_0_80px_-5px_rgba(0,0,0,0.2)] overflow-hidden flex flex-col">
                  {/* Top padding where CRM28 logo used to be */}
                  <div className="shrink-0 h-4" />
                  <div
                    className={[
                      "flex-1 overflow-y-auto overscroll-contain",
                      "[scrollbar-width:none]",
                      "[-ms-overflow-style:none]",
                      "[&::-webkit-scrollbar]:w-0",
                      "[&::-webkit-scrollbar]:h-0",
                    ].join(" ")}
                  >
                    <SidebarNav />
                  </div>

                  <div className="shrink-0 h-6 bg-gradient-to-t from-white/80 to-transparent pointer-events-none" />
                </div>
              </div>
            </aside>

            {/* Main content */}
            <main className="flex-1 min-w-0 lg:pl-[148px]">
              <div className="px-2 sm:px-4 pt-4 pb-6 space-y-4">
                <div className="rounded-2xl sm:rounded-3xl bg-white/85 backdrop-blur-xl border border-white/60 shadow-[0_30px_70px_-22px_rgba(0,0,0,0.25)] overflow-visible">
                  <div className="p-4 sm:p-6 overflow-visible">{children}</div>
                </div>
              </div>
            </main>
          </div>
        </div>
      </div>
      <ChatBubbleContainer />
      <MessengerModalBridge />
    </ModalStackWrapper>
    </MessengerProvider>
    </I18nProvider>
  );
}
