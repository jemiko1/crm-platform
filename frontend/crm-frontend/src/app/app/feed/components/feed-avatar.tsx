"use client";

export function FeedAvatar({
  name,
  initials,
  src,
  size = "md",
  ring,
}: {
  name: string;
  initials: string;
  src?: string;
  size?: "sm" | "md" | "lg";
  ring?: boolean;
}) {
  const dim = size === "sm" ? "h-9 w-9 text-xs" : size === "lg" ? "h-14 w-14 text-base" : "h-11 w-11 text-sm";
  const base = [
    "shrink-0 rounded-2xl font-semibold flex items-center justify-center overflow-hidden",
    "bg-gradient-to-br from-zinc-100 to-zinc-200/90 text-zinc-700",
    dim,
    ring ? "ring-2 ring-white shadow-md" : "",
  ].join(" ");

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        className={`${base} object-cover`}
        title={name}
      />
    );
  }

  return (
    <div
      className={base}
      style={{ boxShadow: ring ? "0 0 0 1px rgba(0, 86, 83, 0.22)" : undefined }}
      title={name}
    >
      {initials}
    </div>
  );
}
