"use client";

import { useRouter } from "next/navigation";
import type { DiaryBrief } from "@/lib/types";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function DiaryCard({ diary }: { diary: DiaryBrief }) {
  const router = useRouter();

  return (
    <article
      className="card cursor-pointer"
      onClick={() => router.push(`/diary/${diary.id}`)}
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

      <div className="mt-3 flex items-center justify-between">
        <div className="flex flex-wrap gap-1.5">
          {diary.tags.map((t) => (
            <span
              key={t}
              className="tag cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/tags/${encodeURIComponent(t)}`);
              }}
            >
              {t}
            </span>
          ))}
        </div>
        <time className="shrink-0 text-xs"
          style={{ color: "var(--color-text-tertiary)" }}>
          {formatDate(diary.created_at)}
        </time>
      </div>
    </article>
  );
}
