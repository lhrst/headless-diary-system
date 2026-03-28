"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { DiaryBrief } from "@/lib/types";
import { getDiary } from "@/lib/api";

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

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

interface DiaryCardProps {
  diary: DiaryBrief;
  index?: number;
  isNew?: boolean;
}

export default function DiaryCard({ diary, index = 0, isNew }: DiaryCardProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [fullContent, setFullContent] = useState<string | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);

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
  const cleanPreview = stripHtml(diary.preview);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    // If we already have full content, copy it; otherwise fetch first
    let text = fullContent;
    if (!text) {
      try {
        const detail = await getDiary(diary.id);
        text = detail.content;
        setFullContent(text);
      } catch {
        text = cleanPreview;
      }
    }
    // Strip HTML/markdown for clean plain text
    const plain = (text || "").replace(/<[^>]+>/g, "").trim();
    const copyText = `${diary.title || ""}\n\n${plain}`.trim();
    await navigator.clipboard.writeText(copyText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [fullContent, diary.id, diary.title, cleanPreview]);

  const handleExpand = async () => {
    if (isPlaceholder) return;
    if (!expanded && fullContent === null) {
      setLoadingContent(true);
      try {
        const detail = await getDiary(diary.id);
        setFullContent(detail.content);
      } catch {
        setFullContent(cleanPreview);
      } finally {
        setLoadingContent(false);
      }
    }
    setExpanded(!expanded);
  };

  return (
    <article
      className={`card group ${isNew ? "animate-warm-glow" : "animate-fade-in-up"}`}
      style={{
        animationDelay: isNew ? "0ms" : `${index * 60}ms`,
        opacity: isPlaceholder ? 0.7 : undefined,
      }}
    >
      {/* Header: title + time + actions */}
      <div className="flex items-start justify-between gap-3">
        <div
          className="min-w-0 flex-1 cursor-pointer"
          onClick={handleExpand}
        >
          <h3
            className={`font-serif text-base font-semibold leading-snug ${isPlaceholder ? "skeleton h-5 w-2/3" : ""}`}
            style={{ color: "var(--color-text)" }}
          >
            {isPlaceholder ? "\u00A0" : diary.title || "无标题"}
          </h3>
        </div>

        <div className="shrink-0 flex items-center gap-2">
          <span
            className="text-xs font-medium"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            {formatRelativeDate(diary.created_at)}
          </span>
          {/* Edit + Expand buttons */}
          {!isPlaceholder && (
            <div className="flex items-center gap-1">
              <button
                onClick={handleCopy}
                className="btn-ghost p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                title="复制全文"
                style={{ color: copied ? "var(--color-primary)" : "var(--color-text-tertiary)" }}
              >
                {copied ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="14" height="14" x="8" y="8" rx="2" />
                    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                  </svg>
                )}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/diary/${diary.id}/edit`);
                }}
                className="btn-ghost p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                title="编辑"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Preview / Expanded content */}
      <div className="cursor-pointer" onClick={handleExpand}>
        {!expanded ? (
          <p
            className="mt-1.5 line-clamp-3 text-sm leading-relaxed"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {cleanPreview}
          </p>
        ) : (
          <div className="mt-3 animate-fade-in">
            {loadingContent ? (
              <div className="space-y-2">
                <div className="skeleton h-4 w-full" />
                <div className="skeleton h-4 w-4/5" />
                <div className="skeleton h-4 w-3/5" />
              </div>
            ) : fullContent ? (
              <div className="prose text-sm">
                {fullContent.includes("<p>") || fullContent.includes("<h") ? (
                  <div dangerouslySetInnerHTML={{ __html: fullContent }} />
                ) : (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {fullContent}
                  </ReactMarkdown>
                )}
              </div>
            ) : null}

            {/* Action bar when expanded */}
            <div
              className="mt-4 pt-3 flex items-center justify-between"
              style={{ borderTop: "1px solid var(--color-border)" }}
            >
              <button
                className="text-xs font-medium transition-colors"
                style={{ color: "var(--color-text-tertiary)" }}
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(false);
                }}
              >
                收起
              </button>
              <div className="flex items-center gap-2">
                <button
                  className="btn-ghost text-xs"
                  style={{ color: copied ? "var(--color-primary)" : "var(--color-text-secondary)" }}
                  onClick={handleCopy}
                >
                  {copied ? "已复制" : "复制全文"}
                </button>
                <button
                  className="btn-ghost text-xs"
                  style={{ color: "var(--color-text-secondary)" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/diary/${diary.id}`);
                  }}
                >
                  详情
                </button>
                <button
                  className="btn-primary text-xs"
                  style={{ padding: "4px 12px" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/diary/${diary.id}/edit`);
                  }}
                >
                  编辑
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tags + meta */}
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {diary.tags.slice(0, 4).map((t) => {
            const isAi = diary.ai_tags?.includes(t);
            return (
              <span
                key={t}
                className="tag cursor-pointer"
                style={isAi ? { opacity: 0.7 } : undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/tags/${encodeURIComponent(t)}`);
                }}
              >
                {isAi && (
                  <svg
                    className="mr-0.5 -mt-px inline-block"
                    width="10" height="10" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round"
                  >
                    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
                  </svg>
                )}
                {t}
              </span>
            );
          })}
          {diary.tags.length > 4 && (
            <span className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>
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

      {/* Placeholder */}
      {isPlaceholder && (
        <div className="mt-3 flex items-center gap-2">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{
              backgroundColor: "var(--color-primary)",
              animation: "gentlePulse 1.5s infinite",
            }}
          />
          <span className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>
            AI 正在生成标题...
          </span>
        </div>
      )}
    </article>
  );
}
