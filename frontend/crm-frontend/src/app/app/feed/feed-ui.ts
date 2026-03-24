/**
 * Shared feed UI tokens aligned with Buildings page primary actions:
 * `BRAND = "rgb(0, 86, 83)"` + `shadow-sm hover:opacity-95` pattern.
 */

export const BTN_PRIMARY =
  "rounded-lg md:rounded-2xl px-3 py-2 md:px-4 md:py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity bg-[rgb(0,86,83)]";

export const BTN_PRIMARY_SM =
  "rounded-lg md:rounded-2xl px-2.5 py-1.5 md:px-3 md:py-2 text-xs font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity bg-[rgb(0,86,83)]";

export const BTN_SECONDARY =
  "rounded-lg md:rounded-2xl border border-zinc-200 bg-white px-3 py-2 md:px-4 md:py-2.5 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 transition-colors";

export const BTN_SECONDARY_SM =
  "rounded-lg md:rounded-2xl border border-zinc-200 bg-white px-2.5 py-1.5 md:px-3 md:py-2 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 transition-colors";

export const BTN_GHOST_ICON =
  "rounded-xl p-2 transition border border-transparent text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800";

export const BTN_GHOST_ICON_ACTIVE =
  "rounded-xl p-2 transition border border-[rgba(0,86,83,0.35)] bg-[rgba(0,86,83,0.08)] text-[rgb(0,86,83)]";

/** Inputs / selects — teal focus ring to match Buildings search field */
export const INPUT_FIELD =
  "w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/50";

export const TEXTAREA_FIELD =
  "w-full resize-y rounded-2xl border border-zinc-200 bg-zinc-50/80 px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/50";

export const SELECT_FIELD =
  "rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-800 shadow-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/50";

export const CARD_POST =
  "rounded-3xl border border-zinc-200/80 bg-white/95 p-4 sm:p-5 shadow-[0_18px_44px_-28px_rgba(0,0,0,0.2)] hover:shadow-[0_22px_50px_-26px_rgba(0,0,0,0.22)] transition-shadow";

export const CARD_SIDEBAR =
  "rounded-3xl border border-zinc-200/80 bg-white/95 p-4 shadow-[0_16px_40px_-24px_rgba(0,0,0,0.2)]";

/** Poll / vote selected ring */
export const POLL_OPTION_ACTIVE =
  "border-[rgb(0,86,83)] ring-2 ring-[rgba(0,86,83,0.25)] ring-offset-2";

export const POLL_BAR_FILL = "bg-[rgba(0,86,83,0.14)]";

/** Reaction chip when user toggled on */
export const REACTION_ACTIVE =
  "border-[rgba(0,86,83,0.35)] bg-[rgba(0,86,83,0.08)] text-zinc-900";

export const REACTION_IDLE =
  "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-white hover:border-zinc-300";

/** Tab pill active (solid brand — same teal as Buildings) */
export const TAB_ACTIVE =
  "text-white border-transparent bg-[rgb(0,86,83)] shadow-sm shadow-[0_8px_24px_-8px_rgba(0,86,83,0.35)]";

export const TAB_IDLE =
  "bg-white/90 text-zinc-700 border-zinc-200/80 hover:border-zinc-300 hover:bg-white";

export const INLINE_STATUS =
  "rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700";

export const INLINE_STATUS_INFO = "border-sky-200/80 bg-sky-50/80 text-sky-900";
