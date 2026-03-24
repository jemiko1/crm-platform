"use client";

import type { ReactNode } from "react";
import { CARD_SIDEBAR } from "../feed-ui";

export function FeedSidebarCard({
  id,
  title,
  subtitle,
  icon,
  children,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  icon: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={CARD_SIDEBAR}>
      <div className="flex items-start gap-2">
        <span className="text-lg" aria-hidden>
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
