"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DiaryBrief } from "@/lib/types";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DiaryCard({ diary }: { diary: DiaryBrief }) {
  const router = useRouter();

  const weatherInfo =
    diary.weather_icon || diary.weather
      ? `${diary.weather_icon ?? ""} ${diary.weather ?? ""}`.trim()
      : null;

  const addressShort = diary.address
    ? diary.address.length > 30
      ? diary.address.slice(0, 30) + "..."
      : diary.address
    : null;

  return (
    <Link href={`/diary/${diary.id}`} className="block">
    <article
      className="card cursor-pointer hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold leading-snug truncate"
            style={{ color: "var(--color-text)" }}>
            {diary.title || "无标题"}
          </h3>
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed"
            style={{ color: "var(--color-text-secondary)" }}>
            {diary.preview}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {diary.tags.map((t) => {
            const isAi = diary.ai_tags?.includes(t);
            return (
              <span
                key={t}
                className={`tag cursor-pointer${isAi ? " tag-ai" : ""}`}
                style={isAi ? {
                  borderStyle: "dashed",
                  opacity: 0.85,
                } : undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  router.push(`/tags/${encodeURIComponent(t)}`);
                }}
              >
                {isAi && (
                  <svg
                    className="inline-block mr-0.5 -mt-0.5"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 2a4 4 0 0 1 4 4v2a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z" />
                    <path d="M16 14h.01" />
                    <path d="M8 14h.01" />
                    <path d="M12 18v4" />
                    <path d="M7 22h10" />
                    <path d="M5 12H3a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h2" />
                    <path d="M19 12h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-2" />
                  </svg>
                )}
                {t}
              </span>
            );
          })}
        </div>
        <div
          className="shrink-0 flex items-center gap-1.5 text-xs"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          {weatherInfo && <span>{weatherInfo}</span>}
          {weatherInfo && <span>·</span>}
          {addressShort && (
            <>
              <span>{addressShort}</span>
              <span>·</span>
            </>
          )}
          <time>{formatDate(diary.created_at)}</time>
        </div>
      </div>
    </article>
    </Link>
  );
}
