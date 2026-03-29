"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import BugReporterWidget from "./bug-reporter-widget";

export default function BugReporterGate() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_BUG_REPORTER_ENABLED !== "true") return;

    apiGet<{ id: string }>("/auth/me")
      .then(() => setShow(true))
      .catch(() => {});
  }, []);

  if (!show) return null;
  return <BugReporterWidget />;
}
