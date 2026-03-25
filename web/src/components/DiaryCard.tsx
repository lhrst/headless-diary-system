"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DiaryBrief } from "@/lib/types";

function formatRelativeDate(iso: string): string {
  const now = Date.now();
  const date = new Date(iso).getTime();
  const diff = now - date;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days < 7) return `${days} 天前`;

  return new Date(iso).toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
  });
}

interface DiaryCardProps {
  diary: DiaryBrief;
  index?: number;
  isNew?: boolean;
}

export default function DiaryCard({ diary, index = 0, isNew }: DiaryCardProps) {
  const router = useRouter();

  const weatherInfo =
    diary.weather_icon || diary.weather
      ? `${diary.weather_icon ?? ""} ${diary.weather ?? ""}`.trim()
      : null;

  const addressShort = diary.address
    ? diary.address.length > 20
      ? diary.address.slice(0, 20) + "..."
      : diary.address
    : null;

  const isPlaceholder = diary.id.startsWith("temp-");

  return (
    <Link href={isPlaceholder ? "#" : `/diary/${diary.id}`} className="block">
      <article
        className={`card cursor-pointer group ${isNew ? "animate-warm-glow" : "animate-fade-in-up"}`}
        style={{
          animationDelay: isNew ? "0ms" : `${index * 60}ms`,
          opacity: isPlaceholder ? 0.7 : undefined,
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3
              className={`font-serif text-base font-semibold leading-snug ${isPlaceholder ? "skeleton h-5 w-2/3" : ""}`}
              style={{ color: "var(--color-text)" }}
            >
              {isPlaceholder ? "\u00A0" : diary.title || "无标题"}
            </h3>
            <p
              className="mt-1.5 line-clamp-2 text-sm leading-relaxed"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {diary.preview}
            </p>
          </div>

          {/* Date badge on the right */}
          <div
            className="shrink-0 text-right"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            <span className="text-xs font-medium">
              {formatRelativeDate(diary.created_at)}
            </span>
          </div>
        </div>

        {/* Bottom row: tags + meta */}
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {diary.tags.slice(0, 4).map((t) => {
              const isAi = diary.ai_tags?.includes(t);
              return (
                <span
                  key={t}
                  className="tag cursor-pointer"
                  style={
                    isAi
                      ? {
                          borderStyle: "dashed",
                          border: "1px dashed var(--color-primary-light, var(--color-accent))",
                          opacity: 0.8,
                        }
                      : undefined
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    router.push(`/tags/${encodeURIComponent(t)}`);
                  }}
                >
                  {isAi && (
                    <svg
                      className="mr-0.5 -mt-px inline-block"
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
                    </svg>
                  )}
                  {t}
                </span>
              );
            })}
            {diary.tags.length > 4 && (
              <span
                className="text-xs"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                +{diary.tags.length - 4}
              </span>
            )}
          </div>

          <div
            className="shrink-0 flex items-center gap-1.5 text-xs"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            {weatherInfo && <span>{weatherInfo}</span>}
            {addressShort && (
              <>
                {weatherInfo && <span className="opacity-40">·</span>}
                <span>{addressShort}</span>
              </>
            )}
          </div>
        </div>

        {/* Placeholder shimmer bar for pending title */}
        {isPlaceholder && (
          <div className="mt-3 flex items-center gap-2">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{
                backgroundColor: "var(--color-primary)",
                animation: "gentlePulse 1.5s infinite",
              }}
            />
            <span
              className="text-xs"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              AI 正在生成标题...
            </span>
          </div>
        )}
      </article>
    </Link>
  );
}
