"use client";

import React, { useState } from "react";
import { apiPost, apiPatch, apiDelete, ApiError } from "@/lib/api";

type Note = {
  id: string;
  content: string;
  isPinned: boolean;
  createdAt: string;
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
  };
};

type Reminder = {
  id: string;
  title: string;
  description: string | null;
  remindAt: string;
  status: "PENDING" | "COMPLETED" | "CANCELLED";
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
  };
};

type Appointment = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startTime: string;
  endTime: string | null;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  outcome: string | null;
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
  };
};

interface LeadNotesSectionProps {
  leadId: string;
  notes: Note[];
  reminders: Reminder[];
  appointments: Appointment[];
  onUpdate: () => void;
}

export default function LeadNotesSection({
  leadId,
  notes,
  reminders,
  appointments,
  onUpdate,
}: LeadNotesSectionProps) {
  const [activeSubTab, setActiveSubTab] = useState<"notes" | "reminders" | "appointments">("notes");
  const [showAddNote, setShowAddNote] = useState(false);
  const [showAddReminder, setShowAddReminder] = useState(false);
  const [showAddAppointment, setShowAddAppointment] = useState(false);

  // Note form
  const [noteContent, setNoteContent] = useState("");
  const [notePinned, setNotePinned] = useState(false);

  // Reminder form
  const [reminderTitle, setReminderTitle] = useState("");
  const [reminderDescription, setReminderDescription] = useState("");
  const [reminderDate, setReminderDate] = useState("");

  // Appointment form
  const [appointmentTitle, setAppointmentTitle] = useState("");
  const [appointmentDescription, setAppointmentDescription] = useState("");
  const [appointmentLocation, setAppointmentLocation] = useState("");
  const [appointmentStartTime, setAppointmentStartTime] = useState("");
  const [appointmentEndTime, setAppointmentEndTime] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await apiPost(`/v1/sales/leads/${leadId}/notes`, {
        content: noteContent,
        isPinned: notePinned,
      });
      setShowAddNote(false);
      setNoteContent("");
      setNotePinned(false);
      onUpdate();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!confirm("Delete this note?")) return;

    try {
      await apiDelete(`/v1/sales/leads/${leadId}/notes/${noteId}`);
      onUpdate();
    } catch (err) {
      if (err instanceof ApiError) {
        alert(err.message);
      }
    }
  };

  const handleAddReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await apiPost(`/v1/sales/leads/${leadId}/reminders`, {
        title: reminderTitle,
        description: reminderDescription || undefined,
        remindAt: new Date(reminderDate).toISOString(),
      });
      setShowAddReminder(false);
      setReminderTitle("");
      setReminderDescription("");
      setReminderDate("");
      onUpdate();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteReminder = async (reminderId: string) => {
    try {
      await apiPost(`/v1/sales/leads/${leadId}/reminders/${reminderId}/complete`, {});
      onUpdate();
    } catch (err) {
      if (err instanceof ApiError) {
        alert(err.message);
      }
    }
  };

  const handleAddAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await apiPost(`/v1/sales/leads/${leadId}/appointments`, {
        title: appointmentTitle,
        description: appointmentDescription || undefined,
        location: appointmentLocation || undefined,
        startTime: new Date(appointmentStartTime).toISOString(),
        endTime: appointmentEndTime ? new Date(appointmentEndTime).toISOString() : undefined,
      });
      setShowAddAppointment(false);
      setAppointmentTitle("");
      setAppointmentDescription("");
      setAppointmentLocation("");
      setAppointmentStartTime("");
      setAppointmentEndTime("");
      onUpdate();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Sub Tabs */}
      <div className="mb-6 flex gap-4 border-b border-zinc-200">
        {[
          { id: "notes", label: `Notes (${notes.length})` },
          { id: "reminders", label: `Reminders (${reminders.length})` },
          { id: "appointments", label: `Appointments (${appointments.length})` },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id as any)}
            className={`border-b-2 pb-3 text-sm font-medium ${
              activeSubTab === tab.id
                ? "border-emerald-500 text-emerald-600"
                : "border-transparent text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Notes */}
      {activeSubTab === "notes" && (
        <div>
          <div className="mb-4 flex justify-end">
            <button
              onClick={() => setShowAddNote(true)}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Add Note
            </button>
          </div>

          {showAddNote && (
            <form onSubmit={handleAddNote} className="mb-6 rounded-xl bg-zinc-50 p-4">
              {error && (
                <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
              )}
              <textarea
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="Write your note..."
                required
                rows={3}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
              <div className="mt-3 flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={notePinned}
                    onChange={(e) => setNotePinned(e.target.checked)}
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                  Pin this note
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddNote(false)}
                    className="rounded-lg border border-zinc-200 px-4 py-2 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
                  >
                    {loading ? "Saving..." : "Save Note"}
                  </button>
                </div>
              </div>
            </form>
          )}

          <div className="space-y-4">
            {notes.map((note) => (
              <div
                key={note.id}
                className={`rounded-xl border p-4 ${
                  note.isPinned ? "border-amber-300 bg-amber-50" : "border-zinc-200 bg-white"
                }`}
              >
                <div className="flex items-start justify-between">
                  <p className="text-sm text-zinc-700 whitespace-pre-wrap">{note.content}</p>
                  <button
                    onClick={() => handleDeleteNote(note.id)}
                    className="ml-4 text-zinc-400 hover:text-red-600"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
                  <span>
                    {note.createdBy.firstName} {note.createdBy.lastName}
                  </span>
                  <span>{new Date(note.createdAt).toLocaleString()}</span>
                </div>
              </div>
            ))}
            {notes.length === 0 && <p className="text-center text-zinc-500">No notes yet</p>}
          </div>
        </div>
      )}

      {/* Reminders */}
      {activeSubTab === "reminders" && (
        <div>
          <div className="mb-4 flex justify-end">
            <button
              onClick={() => setShowAddReminder(true)}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Add Reminder
            </button>
          </div>

          {showAddReminder && (
            <form onSubmit={handleAddReminder} className="mb-6 rounded-xl bg-zinc-50 p-4">
              {error && (
                <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Title</label>
                  <input
                    type="text"
                    value={reminderTitle}
                    onChange={(e) => setReminderTitle(e.target.value)}
                    required
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Remind At</label>
                  <input
                    type="datetime-local"
                    value={reminderDate}
                    onChange={(e) => setReminderDate(e.target.value)}
                    required
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-sm font-medium">Description</label>
                  <textarea
                    value={reminderDescription}
                    onChange={(e) => setReminderDescription(e.target.value)}
                    rows={2}
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddReminder(false)}
                  className="rounded-lg border border-zinc-200 px-4 py-2 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
                >
                  {loading ? "Creating..." : "Create Reminder"}
                </button>
              </div>
            </form>
          )}

          <div className="space-y-3">
            {reminders.map((reminder) => (
              <div
                key={reminder.id}
                className={`flex items-center justify-between rounded-xl border p-4 ${
                  reminder.status === "COMPLETED"
                    ? "border-emerald-200 bg-emerald-50"
                    : new Date(reminder.remindAt) < new Date()
                    ? "border-red-200 bg-red-50"
                    : "border-zinc-200 bg-white"
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-900">{reminder.title}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        reminder.status === "COMPLETED"
                          ? "bg-emerald-100 text-emerald-700"
                          : reminder.status === "CANCELLED"
                          ? "bg-zinc-100 text-zinc-600"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {reminder.status}
                    </span>
                  </div>
                  {reminder.description && (
                    <p className="mt-1 text-sm text-zinc-600">{reminder.description}</p>
                  )}
                  <p className="mt-1 text-xs text-zinc-500">
                    Remind: {new Date(reminder.remindAt).toLocaleString()}
                  </p>
                </div>
                {reminder.status === "PENDING" && (
                  <button
                    onClick={() => handleCompleteReminder(reminder.id)}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                  >
                    Complete
                  </button>
                )}
              </div>
            ))}
            {reminders.length === 0 && <p className="text-center text-zinc-500">No reminders yet</p>}
          </div>
        </div>
      )}

      {/* Appointments */}
      {activeSubTab === "appointments" && (
        <div>
          <div className="mb-4 flex justify-end">
            <button
              onClick={() => setShowAddAppointment(true)}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Schedule Appointment
            </button>
          </div>

          {showAddAppointment && (
            <form onSubmit={handleAddAppointment} className="mb-6 rounded-xl bg-zinc-50 p-4">
              {error && (
                <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Title</label>
                  <input
                    type="text"
                    value={appointmentTitle}
                    onChange={(e) => setAppointmentTitle(e.target.value)}
                    required
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Location</label>
                  <input
                    type="text"
                    value={appointmentLocation}
                    onChange={(e) => setAppointmentLocation(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Start Time</label>
                  <input
                    type="datetime-local"
                    value={appointmentStartTime}
                    onChange={(e) => setAppointmentStartTime(e.target.value)}
                    required
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">End Time</label>
                  <input
                    type="datetime-local"
                    value={appointmentEndTime}
                    onChange={(e) => setAppointmentEndTime(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-sm font-medium">Description</label>
                  <textarea
                    value={appointmentDescription}
                    onChange={(e) => setAppointmentDescription(e.target.value)}
                    rows={2}
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddAppointment(false)}
                  className="rounded-lg border border-zinc-200 px-4 py-2 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
                >
                  {loading ? "Creating..." : "Schedule"}
                </button>
              </div>
            </form>
          )}

          <div className="space-y-3">
            {appointments.map((appointment) => (
              <div
                key={appointment.id}
                className={`rounded-xl border p-4 ${
                  appointment.status === "COMPLETED"
                    ? "border-emerald-200 bg-emerald-50"
                    : appointment.status === "CANCELLED"
                    ? "border-zinc-200 bg-zinc-50"
                    : "border-blue-200 bg-blue-50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-900">{appointment.title}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        appointment.status === "COMPLETED"
                          ? "bg-emerald-100 text-emerald-700"
                          : appointment.status === "CANCELLED"
                          ? "bg-zinc-100 text-zinc-600"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {appointment.status}
                    </span>
                  </div>
                </div>
                {appointment.description && (
                  <p className="mt-2 text-sm text-zinc-600">{appointment.description}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-500">
                  <span>📅 {new Date(appointment.startTime).toLocaleString()}</span>
                  {appointment.location && <span>📍 {appointment.location}</span>}
                </div>
                {appointment.outcome && (
                  <p className="mt-2 rounded bg-emerald-100 p-2 text-sm text-emerald-700">
                    Outcome: {appointment.outcome}
                  </p>
                )}
              </div>
            ))}
            {appointments.length === 0 && (
              <p className="text-center text-zinc-500">No appointments yet</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
