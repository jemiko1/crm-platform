"use client";

import { useMemo, useState } from "react";
import { useMessenger } from "./messenger-context";
import type { Conversation } from "./types";

interface EmployeeInfoPanelProps {
  conversation: Conversation | null;
  onClose: () => void;
}

export default function EmployeeInfoPanel({
  conversation,
  onClose,
}: EmployeeInfoPanelProps) {
  const { myEmployeeId, onlineUsers } = useMessenger();
  const [showMembers, setShowMembers] = useState(true);

  const otherParticipants = useMemo(
    () =>
      conversation?.participants.filter(
        (p) => p.employeeId !== myEmployeeId,
      ) ?? [],
    [conversation, myEmployeeId],
  );

  const isGroup = conversation?.type === "GROUP";
  const mainPerson = !isGroup ? otherParticipants[0] : null;
  const isOnline = mainPerson
    ? onlineUsers.has(mainPerson.employeeId)
    : false;

  if (!conversation) return null;

  return (
    <div className="w-[280px] border-l border-zinc-200 bg-white flex flex-col overflow-y-auto shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
        <h4 className="text-sm font-semibold text-zinc-900">
          {isGroup ? "Group Info" : "Contact Info"}
        </h4>
        <button
          onClick={onClose}
          className="p-1 hover:bg-zinc-100 rounded-lg text-zinc-400"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18 18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Profile */}
      <div className="flex flex-col items-center px-4 py-6 border-b border-zinc-100">
        {isGroup ? (
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-xl font-bold">
            {(conversation.name ?? "G").charAt(0).toUpperCase()}
          </div>
        ) : mainPerson?.employee.avatar ? (
          <div className="relative">
            <img
              src={mainPerson.employee.avatar}
              alt=""
              className="w-16 h-16 rounded-full object-cover"
            />
            {isOnline && (
              <div className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white" />
            )}
          </div>
        ) : (
          <div className="relative">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-lg font-bold">
              {mainPerson
                ? `${mainPerson.employee.firstName.charAt(0)}${mainPerson.employee.lastName.charAt(0)}`
                : "?"}
            </div>
            {isOnline && (
              <div className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white" />
            )}
          </div>
        )}

        <h3 className="text-sm font-semibold text-zinc-900 mt-3">
          {isGroup
            ? conversation.name ?? "Group Chat"
            : mainPerson
              ? `${mainPerson.employee.firstName} ${mainPerson.employee.lastName}`
              : "Unknown"}
        </h3>

        {!isGroup && mainPerson && (
          <>
            <p className="text-xs text-zinc-500">
              {mainPerson.employee.position?.name ??
                mainPerson.employee.jobTitle ??
                ""}
            </p>
            <p className="text-xs text-zinc-400 mt-0.5">
              {isOnline ? "Active now" : "Offline"}
            </p>
          </>
        )}

        {isGroup && (
          <p className="text-xs text-zinc-500">
            {conversation.participants.length} members
          </p>
        )}
      </div>

      {/* Contact Details (direct only) */}
      {!isGroup && mainPerson && (
        <div className="px-4 py-3 border-b border-zinc-100 space-y-2.5">
          {mainPerson.employee.email && (
            <div>
              <div className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
                Email
              </div>
              <div className="text-sm text-zinc-700">
                {mainPerson.employee.email}
              </div>
            </div>
          )}
          {mainPerson.employee.phone && (
            <div>
              <div className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
                Phone
              </div>
              <div className="text-sm text-zinc-700">
                {mainPerson.employee.phone}
              </div>
            </div>
          )}
          {mainPerson.employee.department && (
            <div>
              <div className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
                Department
              </div>
              <div className="text-sm text-zinc-700">
                {mainPerson.employee.department.name}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Members (group only) */}
      {isGroup && (
        <div className="px-4 py-3">
          <button
            onClick={() => setShowMembers(!showMembers)}
            className="flex items-center justify-between w-full text-sm font-medium text-zinc-900 mb-2"
          >
            <span>Members ({conversation.participants.length})</span>
            <svg
              className={`w-4 h-4 text-zinc-400 transition-transform ${showMembers ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m19.5 8.25-7.5 7.5-7.5-7.5"
              />
            </svg>
          </button>
          {showMembers && (
            <div className="space-y-1">
              {conversation.participants.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-2.5 py-1.5 px-2 rounded-lg hover:bg-zinc-50"
                >
                  <div className="relative">
                    {p.employee.avatar ? (
                      <img
                        src={p.employee.avatar}
                        alt=""
                        className="w-7 h-7 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-[9px] font-semibold">
                        {p.employee.firstName.charAt(0)}
                        {p.employee.lastName.charAt(0)}
                      </div>
                    )}
                    {onlineUsers.has(p.employeeId) && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border border-white" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-zinc-800 truncate">
                      {p.employee.firstName} {p.employee.lastName}
                      {p.employeeId === myEmployeeId && (
                        <span className="text-zinc-400 ml-1">(you)</span>
                      )}
                    </div>
                    {p.role === "ADMIN" && (
                      <span className="text-[9px] text-emerald-600 font-medium">
                        Admin
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="px-4 py-3 mt-auto border-t border-zinc-100 space-y-1">
        <button className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-600 hover:bg-zinc-50 rounded-lg transition-colors">
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
            />
          </svg>
          Search in conversation
        </button>
        <button className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-600 hover:bg-zinc-50 rounded-lg transition-colors">
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.143 17.082a24.248 24.248 0 0 0 3.844.148m-3.844-.148a23.856 23.856 0 0 1-5.455-1.31 8.964 8.964 0 0 0 2.3-5.542m3.155 6.852a3 3 0 0 0 5.667 1.97m-5.667-1.97 .08-.17A23.89 23.89 0 0 0 12 15c0-3.572-.78-6.963-2.173-10.007m0 0A23.89 23.89 0 0 1 12 4.93c3.064 0 5.96.603 8.618 1.693m-8.618-1.693A23.898 23.898 0 0 1 2.382 6.623"
            />
          </svg>
          Mute conversation
        </button>
        <button className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-600 hover:bg-zinc-50 rounded-lg transition-colors">
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z"
            />
          </svg>
          Archive conversation
        </button>
      </div>
    </div>
  );
}
