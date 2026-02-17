"use client";

import TasksIcon from "./tasks-icon";
import HeaderSearch from "./header-search";
import HeaderNotifications from "./header-notifications";
import HeaderMessengerIcon from "./header-messenger-icon";
import ProfileMenu from "./profile-menu";

export default function AppHeader() {
  return (
    <header className="sticky top-0 z-50 bg-white shadow-[0_4px_16px_-2px_rgba(0,0,0,0.15)]">
      <div className="flex items-center h-[52px] px-4">
        {/* CRM28 - centered above the left sidebar (left-4 + w-[108px] = 16px to 124px) */}
        <div className="hidden lg:flex w-[108px] items-center justify-center shrink-0">
          <span className="text-xl font-bold text-zinc-900 tracking-tight select-none" title="CRM Platform">
            CRM28
          </span>
        </div>

        {/* Spacer to align search with main content start (148px total - 108px logo - 16px px-4) */}
        <div className="hidden lg:block w-[24px] shrink-0" />

        {/* Search + Workspace */}
        <div className="flex items-center gap-6 shrink-0">
          <HeaderSearch />
          <div className="hidden sm:block w-px h-6 bg-zinc-200" />
          <TasksIcon />
        </div>

        {/* Flexible spacer */}
        <div className="flex-1" />

        {/* Right side - Action icons + Profile */}
        <div className="flex items-center gap-2">
          <HeaderMessengerIcon />
          <HeaderNotifications />
          <ProfileMenu />
        </div>
      </div>
    </header>
  );
}
