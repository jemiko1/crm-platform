"use client";

import { useEffect, useState } from "react";

type MeResponse = {
  user: { id: string; email: string; role: string } | null;
};

export default function UserBadge() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<MeResponse["user"]>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const res = await fetch("http://localhost:3000/auth/me", {
          method: "GET",
          credentials: "include", // IMPORTANT: sends httpOnly cookie
          cache: "no-store",
        });

        if (!res.ok) throw new Error("Unauthorized");

        const data = (await res.json()) as MeResponse;
        if (alive) setUser(data.user ?? null);
      } catch {
        if (alive) setUser(null);
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return <div className="text-xs text-zinc-500">Loading user…</div>;
  }

  if (!user) {
    return <div className="text-xs text-zinc-500">User info unavailable</div>;
  }

  return (
    <div className="text-right">
      <div className="text-sm font-medium text-zinc-900">{user.email}</div>
      <div className="text-xs text-zinc-500">{user.role}</div>
    </div>
  );
}
