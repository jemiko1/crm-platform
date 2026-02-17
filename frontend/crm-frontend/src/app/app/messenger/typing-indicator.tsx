"use client";

export default function TypingIndicator({ name }: { name?: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5">
      <div className="flex gap-0.5">
        <div
          className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce"
          style={{ animationDelay: "0ms" }}
        />
        <div
          className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce"
          style={{ animationDelay: "150ms" }}
        />
        <div
          className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce"
          style={{ animationDelay: "300ms" }}
        />
      </div>
      <span className="text-xs text-zinc-400">
        {name ? `${name} is typing` : "typing"}
      </span>
    </div>
  );
}
