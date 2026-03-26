"use client";

export default function SalesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl bg-white p-12 shadow-sm ring-1 ring-zinc-200">
      <div className="text-4xl mb-4">⚠️</div>
      <h2 className="text-lg font-semibold text-zinc-900 mb-2">Something went wrong</h2>
      <p className="text-sm text-zinc-500 mb-1 max-w-md text-center">{error.message}</p>
      {error.digest && (
        <p className="text-xs text-zinc-400 mb-4 font-mono">Digest: {error.digest}</p>
      )}
      <button
        onClick={reset}
        className="mt-4 rounded-xl bg-teal-800 px-4 py-2 text-sm font-medium text-white hover:bg-teal-900 transition"
      >
        Try again
      </button>
    </div>
  );
}
