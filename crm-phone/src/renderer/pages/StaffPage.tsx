import React, { useEffect, useMemo, useRef, useState } from "react";
import type { DirectoryEntry } from "../../shared/types";
import {
  BRAND,
  BRAND_SOFT,
  BORDER_SOFT,
  CARD,
  SURFACE_CARD,
  TEXT_MUTED,
  TEXT_STRONG,
  TEXT_SUBTLE,
} from "../theme";

interface Props {
  /** Dial a number — extension or personal phone. */
  onDial: (number: string) => void;
}

type TabMode = "all" | "favorites";

export function StaffPage({ onDial }: Props) {
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<TabMode>("all");
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const favLoaded = useRef(false);

  // Load directory + favorites once. Favorites live in the Electron
  // settings store so they persist per-machine — no backend sync.
  useEffect(() => {
    let cancelled = false;
    window.crmPhone.directory.list().then((rows: DirectoryEntry[]) => {
      if (cancelled) return;
      setEntries(Array.isArray(rows) ? rows : []);
      setLoading(false);
    });
    window.crmPhone.settings.get().then((s: any) => {
      if (cancelled) return;
      const list: string[] = Array.isArray(s?.staffFavorites) ? s.staffFavorites : [];
      setFavorites(new Set(list));
      favLoaded.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleFavorite = (id: string) => {
    if (!favLoaded.current) return;
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      window.crmPhone.settings.set("staffFavorites", Array.from(next));
      return next;
    });
  };

  // Match on first name, last name, email, phone, or extension —
  // substring + case-insensitive so "mar" matches Mariam and "214"
  // matches the extension.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const pool = mode === "favorites"
      ? entries.filter((e) => favorites.has(e.id))
      : entries;
    if (!q) return pool;
    return pool.filter((e) => {
      const hay = [
        e.firstName,
        e.lastName,
        e.email,
        e.phone,
        e.extension,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [entries, mode, favorites, search]);

  // Group the "All" tab rows by department. Favorites tab stays flat
  // (ordered by original first-name sort).
  const grouped = useMemo(() => {
    if (mode === "favorites") {
      return [{ id: "__favs__", name: "Favorites", entries: filtered }];
    }
    const buckets = new Map<string, { id: string; name: string; entries: DirectoryEntry[] }>();
    for (const e of filtered) {
      const dept = e.department;
      const key = dept?.id ?? "__none__";
      const name = dept?.name ?? "Unassigned";
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { id: key, name, entries: [] };
        buckets.set(key, bucket);
      }
      bucket.entries.push(e);
    }
    // Sort departments alphabetically, Unassigned last.
    return Array.from(buckets.values()).sort((a, b) => {
      if (a.id === "__none__") return 1;
      if (b.id === "__none__") return -1;
      return a.name.localeCompare(b.name);
    });
  }, [filtered, mode]);

  return (
    <div style={styles.wrap}>
      <div style={styles.controls}>
        <div style={styles.searchWrap}>
          <span style={styles.searchIcon} aria-hidden="true">
            <SearchIcon />
          </span>
          <input
            type="text"
            placeholder="Search by name, phone, or ext."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={styles.searchInput}
          />
        </div>

        <div style={styles.tabs} role="tablist">
          <TabChip label="All" active={mode === "all"} onClick={() => setMode("all")} />
          <TabChip
            label={`Favorites${favorites.size ? ` (${favorites.size})` : ""}`}
            active={mode === "favorites"}
            onClick={() => setMode("favorites")}
          />
        </div>
      </div>

      <div style={styles.list}>
        {loading ? (
          <div style={styles.empty}>Loading staff…</div>
        ) : filtered.length === 0 ? (
          <div style={styles.empty}>
            {mode === "favorites"
              ? "No favorites yet — tap the star next to a colleague to pin them."
              : search
              ? "No one matches that search."
              : "Directory is empty."}
          </div>
        ) : (
          grouped.map((group) => (
            <section key={group.id} style={styles.group}>
              <div style={styles.groupHeader}>
                <span>{group.name}</span>
                <span style={styles.groupCount}>{group.entries.length}</span>
              </div>
              {group.entries.map((e) => (
                <StaffRow
                  key={e.id}
                  entry={e}
                  starred={favorites.has(e.id)}
                  onDial={onDial}
                  onToggleFavorite={() => toggleFavorite(e.id)}
                />
              ))}
            </section>
          ))
        )}
      </div>
    </div>
  );
}

function StaffRow(props: {
  entry: DirectoryEntry;
  starred: boolean;
  onDial: (number: string) => void;
  onToggleFavorite: () => void;
}) {
  const { entry, starred, onDial, onToggleFavorite } = props;
  const name = `${entry.firstName} ${entry.lastName}`.trim() || entry.email;
  // Prefer the extension when dialing internally; fall back to the
  // personal phone if the colleague has no extension assigned.
  const primary = entry.extension ?? entry.phone;
  const canDial = Boolean(primary);

  return (
    <div style={styles.row}>
      <button
        onClick={onToggleFavorite}
        style={{
          ...styles.starBtn,
          color: starred ? "#f59e0b" : TEXT_SUBTLE,
        }}
        aria-pressed={starred}
        aria-label={starred ? "Remove from favorites" : "Add to favorites"}
        title={starred ? "Remove from favorites" : "Add to favorites"}
      >
        <StarIcon filled={starred} />
      </button>
      <div style={styles.identity}>
        <div style={styles.name}>{name}</div>
        <div style={styles.meta}>
          {entry.extension && (
            <span style={styles.extChip}>Ext {entry.extension}</span>
          )}
          {entry.phone && (
            <span style={styles.phone}>{entry.phone}</span>
          )}
          {!entry.extension && !entry.phone && (
            <span style={styles.phone}>No contact on file</span>
          )}
        </div>
      </div>
      <button
        onClick={() => primary && onDial(primary)}
        disabled={!canDial}
        style={{
          ...styles.dialBtn,
          opacity: canDial ? 1 : 0.4,
          cursor: canDial ? "pointer" : "not-allowed",
        }}
        aria-label={`Call ${name}`}
        title={canDial ? `Call ${primary}` : "No number on file"}
      >
        <PhoneIcon />
      </button>
    </div>
  );
}

function TabChip(props: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      role="tab"
      aria-selected={props.active}
      onClick={props.onClick}
      style={{
        ...styles.tabChip,
        ...(props.active ? styles.tabChipActive : null),
      }}
    >
      {props.label}
    </button>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
    padding: "0.35rem 0.9rem 0.5rem",
    gap: "0.5rem",
  },
  controls: {
    display: "flex",
    flexDirection: "column",
    gap: "0.45rem",
    flexShrink: 0,
  },
  searchWrap: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    background: SURFACE_CARD,
    border: `1px solid ${BORDER_SOFT}`,
    borderRadius: 12,
    padding: "0.45rem 0.7rem 0.45rem 2rem",
    boxShadow: "0 1px 2px rgba(15, 60, 40, 0.04)",
  },
  searchIcon: {
    position: "absolute",
    left: "0.65rem",
    top: "50%",
    transform: "translateY(-50%)",
    color: TEXT_SUBTLE,
    display: "flex",
  },
  searchInput: {
    flex: 1,
    background: "transparent",
    border: "none",
    outline: "none",
    fontSize: "0.85rem",
    color: TEXT_STRONG,
    fontFamily: "inherit",
  },
  tabs: {
    display: "flex",
    gap: "0.35rem",
  },
  tabChip: {
    padding: "0.3rem 0.7rem",
    borderRadius: 999,
    border: `1px solid ${BORDER_SOFT}`,
    background: SURFACE_CARD,
    color: TEXT_MUTED,
    fontSize: "0.72rem",
    fontWeight: 600,
    cursor: "pointer",
    letterSpacing: "0.02em",
  },
  tabChipActive: {
    background: BRAND_SOFT,
    color: BRAND,
    borderColor: "rgba(8, 117, 56, 0.25)",
  },
  list: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "0.55rem",
    paddingRight: 2,
  },
  group: {
    display: "flex",
    flexDirection: "column",
    gap: "0.3rem",
  },
  groupHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.15rem 0.2rem",
    fontSize: "0.68rem",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: TEXT_MUTED,
  },
  groupCount: {
    color: TEXT_SUBTLE,
    fontSize: "0.65rem",
    fontWeight: 600,
  },
  row: {
    ...CARD,
    display: "flex",
    alignItems: "center",
    gap: "0.55rem",
    padding: "0.55rem 0.7rem",
  },
  starBtn: {
    background: "transparent",
    border: "none",
    padding: 4,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  identity: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  name: {
    fontSize: "0.85rem",
    fontWeight: 600,
    color: TEXT_STRONG,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  meta: {
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
    fontSize: "0.72rem",
    color: TEXT_MUTED,
    minWidth: 0,
  },
  extChip: {
    background: BRAND_SOFT,
    color: BRAND,
    padding: "0.08rem 0.45rem",
    borderRadius: 6,
    fontWeight: 700,
    fontVariantNumeric: "tabular-nums",
    letterSpacing: "0.02em",
    flexShrink: 0,
  },
  phone: {
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  dialBtn: {
    width: 38,
    height: 38,
    borderRadius: "50%",
    border: "none",
    background: BRAND,
    color: "white",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    boxShadow: "0 2px 8px rgba(8, 117, 56, 0.22)",
  },
  empty: {
    padding: "1.5rem 0.5rem",
    textAlign: "center",
    fontSize: "0.8rem",
    color: TEXT_MUTED,
  },
};
