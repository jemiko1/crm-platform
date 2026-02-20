"use client";

export default function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" className="mb-4 text-gray-300">
        <path
          d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path d="M8 10h8M8 13h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <h3 className="text-lg font-medium text-gray-500 mb-1">No Conversation Selected</h3>
      <p className="text-sm text-gray-400 max-w-xs">
        Select a conversation from the list to view messages and reply to clients.
      </p>
    </div>
  );
}
