"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 p-8">
      <div className="text-4xl" aria-hidden>
        ⚠️
      </div>
      <h2 className="text-lg font-semibold text-foreground">Something went wrong</h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400 text-center max-w-md">
        {error.message || "An unexpected error occurred"}
      </p>
      <button
        type="button"
        onClick={reset}
        className="px-4 py-2 rounded-xl bg-teal-800 text-white hover:bg-teal-900 transition-opacity hover:opacity-95"
      >
        Try again
      </button>
    </div>
  );
}
