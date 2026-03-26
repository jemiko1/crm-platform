export default function AdminLoading() {
  return (
    <div className="flex flex-col items-center justify-center py-32">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-200 border-t-teal-800" />
      <p className="mt-4 text-sm text-zinc-500">Loading...</p>
    </div>
  );
}
