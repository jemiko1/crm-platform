"use client";

import { useMemo, useState } from "react";
import type { ComposerMode } from "../types";
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  INLINE_STATUS,
  INLINE_STATUS_INFO,
  INPUT_FIELD,
  SELECT_FIELD,
  TAB_ACTIVE,
  TAB_IDLE,
  TEXTAREA_FIELD,
} from "../feed-ui";
import { FeedAvatar } from "./feed-avatar";

const MODES: { id: ComposerMode; label: string; icon: string }[] = [
  { id: "post", label: "Post", icon: "✍️" },
  { id: "poll", label: "Poll", icon: "📊" },
  { id: "announcement", label: "Announcement", icon: "📣" },
  { id: "event", label: "Event", icon: "📅" },
  { id: "recognition", label: "Recognition", icon: "🏅" },
  { id: "upload", label: "Photo / file", icon: "📎" },
];

const TEMPLATES: { id: string; label: string; mode: ComposerMode; body: string }[] = [
  {
    id: "welcome",
    label: "Welcome teammate",
    mode: "post",
    body: "Everyone, please join me in welcoming [Name] to the team! We’re thrilled to have you — here’s to a great journey together.",
  },
  {
    id: "bday",
    label: "Happy birthday",
    mode: "post",
    body: "Happy birthday, [Name]! Wishing you a day full of good energy and a year full of wins. 🎉",
  },
  {
    id: "team-event",
    label: "Team event",
    mode: "event",
    body: "",
  },
  {
    id: "important-ann",
    label: "Important announcement",
    mode: "announcement",
    body: "",
  },
];

export function FeedComposer({
  currentUserName,
  currentUserInitials,
}: {
  currentUserName: string;
  currentUserInitials: string;
}) {
  const [mode, setMode] = useState<ComposerMode>("post");
  const [mainText, setMainText] = useState("");
  const [title, setTitle] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [eventWhere, setEventWhere] = useState("");
  const [eventWhen, setEventWhen] = useState("");
  const [recognitionName, setRecognitionName] = useState("");
  const [recognitionCategory, setRecognitionCategory] = useState("Teamwork");
  const [templateId, setTemplateId] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const expanded = mode !== "post" || mainText.length > 0 || title.length > 0;

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    setMode(t.mode);
    if (t.mode === "post") setMainText(t.body);
    if (t.mode === "announcement") {
      setTitle("Important update for the team");
      setMainText("Please read the following update carefully. If you have questions, reach out in thread or to HR.");
    }
    if (t.mode === "event") {
      setTitle("Team gathering");
      setEventWhere("Main office / link TBD");
      setEventWhen("");
      setMainText("We’d love to see everyone there — RSVP so we can plan food and seating.");
    }
  };

  const modeHint = useMemo(() => {
    switch (mode) {
      case "poll":
        return "Ask something the team can vote on…";
      case "announcement":
        return "Formal update — title + clear body…";
      case "event":
        return "What’s happening, when, and where…";
      case "recognition":
        return "Shine a light on a teammate…";
      case "upload":
        return "Add a caption for your photo or file…";
      default:
        return "Share something with your team…";
    }
  }, [mode]);

  const addPollOption = () => setPollOptions((o) => [...o, ""]);

  const clearForm = () => {
    setMainText("");
    setTitle("");
    setPollOptions(["", ""]);
    setEventWhere("");
    setEventWhen("");
    setRecognitionName("");
    setTemplateId("");
    setMode("post");
    setStatusMessage(null);
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-zinc-200/80 bg-white/95 shadow-[0_20px_50px_-28px_rgba(0,0,0,0.2)]">
      <div className="p-4 sm:p-5">
        <div className="flex gap-3">
          <FeedAvatar name={currentUserName} initials={currentUserInitials} size="md" ring />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex flex-wrap gap-2" role="tablist" aria-label="Composer type">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="tab"
                    aria-selected={mode === m.id}
                    onClick={() => setMode(m.id)}
                    className={[
                      "inline-flex items-center gap-1.5 rounded-2xl border px-3 py-2 text-xs font-semibold shadow-sm transition",
                      mode === m.id ? TAB_ACTIVE : TAB_IDLE,
                    ].join(" ")}
                  >
                    <span aria-hidden>{m.icon}</span>
                    {m.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                <label htmlFor="feed-composer-template" className="whitespace-nowrap text-xs font-medium text-zinc-500">
                  Template
                </label>
                <select
                  id="feed-composer-template"
                  value={templateId}
                  onChange={(e) => applyTemplate(e.target.value)}
                  className={`${SELECT_FIELD} min-w-[10rem]`}
                >
                  <option value="">Choose…</option>
                  {TEMPLATES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="sr-only">Compose post</label>
              <textarea
                value={mainText}
                onChange={(e) => setMainText(e.target.value)}
                rows={expanded ? 4 : 2}
                placeholder={modeHint}
                className={TEXTAREA_FIELD}
              />
            </div>

            {(mode === "announcement" || mode === "event" || mode === "poll" || mode === "recognition") && (
              <div className="space-y-3 rounded-2xl border border-zinc-100 bg-zinc-50/60 p-4">
                {mode === "announcement" && (
                  <>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Announcement title"
                      className={INPUT_FIELD}
                    />
                    <label className="flex items-center gap-2 text-xs text-zinc-600">
                      <input type="checkbox" className="rounded border-zinc-300" />
                      Mark as must-read (acknowledgment)
                    </label>
                  </>
                )}
                {mode === "event" && (
                  <>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Event title"
                      className={INPUT_FIELD}
                    />
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <input
                        type="datetime-local"
                        value={eventWhen}
                        onChange={(e) => setEventWhen(e.target.value)}
                        className={INPUT_FIELD}
                      />
                      <input
                        type="text"
                        value={eventWhere}
                        onChange={(e) => setEventWhere(e.target.value)}
                        placeholder="Location or link"
                        className={INPUT_FIELD}
                      />
                    </div>
                  </>
                )}
                {mode === "poll" && (
                  <>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Poll question"
                      className={INPUT_FIELD}
                    />
                    <div className="space-y-2">
                      {pollOptions.map((opt, i) => (
                        <input
                          key={i}
                          type="text"
                          value={opt}
                          onChange={(e) => {
                            const next = [...pollOptions];
                            next[i] = e.target.value;
                            setPollOptions(next);
                          }}
                          placeholder={`Option ${i + 1}`}
                          className={INPUT_FIELD}
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={addPollOption}
                      className="text-xs font-semibold text-[rgb(0,86,83)] hover:opacity-80"
                    >
                      + Add option
                    </button>
                    <label className="flex items-center gap-2 text-xs text-zinc-600">
                      <input type="checkbox" className="rounded border-zinc-300" defaultChecked />
                      Anonymous results
                    </label>
                  </>
                )}
                {mode === "recognition" && (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <input
                      type="text"
                      value={recognitionName}
                      onChange={(e) => setRecognitionName(e.target.value)}
                      placeholder="Teammate name"
                      className={INPUT_FIELD}
                    />
                    <select
                      value={recognitionCategory}
                      onChange={(e) => setRecognitionCategory(e.target.value)}
                      className={INPUT_FIELD}
                    >
                      {["Teamwork", "Leadership", "Helpful", "Great Job", "Customer Care"].map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {mode === "upload" && (
              <div className="rounded-2xl border-2 border-dashed border-zinc-200 bg-zinc-50/50 px-4 py-8 text-center">
                <p className="text-sm text-zinc-600">Drop a photo or file here, or browse</p>
                <button
                  type="button"
                  className={`mt-3 ${BTN_PRIMARY}`}
                  onClick={() =>
                    setStatusMessage("File picker will open here when uploads are connected to the feed API.")
                  }
                >
                  Choose file
                </button>
                <p className="mt-2 text-xs text-zinc-400">Preview only — no file is uploaded yet.</p>
              </div>
            )}

            {statusMessage && (
              <p role="status" className={`${INLINE_STATUS} ${INLINE_STATUS_INFO}`}>
                {statusMessage}
              </p>
            )}

            <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              <button type="button" className={`w-full sm:w-auto ${BTN_SECONDARY}`} onClick={clearForm}>
                Clear
              </button>
              <button
                type="button"
                className={`w-full sm:w-auto ${BTN_PRIMARY}`}
                onClick={() =>
                  setStatusMessage(
                    "Your post is ready to publish. Saving to the team feed will be available when the API is connected.",
                  )
                }
              >
                Publish
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
