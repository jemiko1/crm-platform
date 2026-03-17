"use client";

interface ExportButtonsProps {
  data: Record<string, unknown>[];
  columns: { key: string; header: string }[];
  filename: string;
}

function toRows(data: Record<string, unknown>[], columns: { key: string; header: string }[]): string[][] {
  const header = columns.map((c) => c.header);
  const rows = data.map((row) => columns.map((c) => String(row[c.key] ?? "")));
  return [header, ...rows];
}

function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");
}

function toTsv(rows: string[][]): string {
  return rows.map((r) => r.join("\t")).join("\n");
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const BTN =
  "rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 shadow-sm hover:bg-zinc-50 transition-colors";

export default function ExportButtons({ data, columns, filename }: ExportButtonsProps) {
  const rows = toRows(data, columns);

  return (
    <div className="flex items-center gap-2">
      <button
        className={BTN}
        onClick={() => navigator.clipboard.writeText(toTsv(rows))}
      >
        Copy
      </button>
      <button
        className={BTN}
        onClick={() => downloadBlob(toCsv(rows), `${filename}.csv`, "text/csv;charset=utf-8;")}
      >
        CSV
      </button>
      <button
        className={BTN}
        onClick={() => downloadBlob(toTsv(rows), `${filename}.xls`, "application/vnd.ms-excel")}
      >
        Excel
      </button>
    </div>
  );
}
