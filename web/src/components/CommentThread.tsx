"use client";

import { useState } from "react";
import type { CommentResponse } from "@/lib/types";
import { createComment } from "@/lib/api";

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);

  if (mins < 60) return `${mins} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;

  return d.toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface Props {
  entryId: string;
  comments: CommentResponse[];
  onNewComment?: (c: CommentResponse) => void;
}

export default function CommentThread({ entryId, comments, onNewComment }: Props) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || loading) return;
    setLoading(true);
    try {
      const c = await createComment(entryId, content.trim());
      setContent("");
      onNewComment?.(c);
    } catch (err) {
      console.error("Failed to create comment:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h3
        className="flex items-center gap-2 text-sm font-semibold"
        style={{ color: "var(--color-text-secondary)" }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
        </svg>
        评论 ({comments.length})
      </h3>

      {comments.length === 0 && (
        <p className="text-sm" style={{ color: "var(--color-text-tertiary)" }}>
          暂无评论，写下你的想法吧
        </p>
      )}

      <div className="space-y-3">
        {comments.map((c, i) => {
          const isAgent = c.author_role === "agent";
          return (
            <div
              key={c.id}
              className="animate-fade-in-up p-4"
              style={{
                animationDelay: `${i * 60}ms`,
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                backgroundColor: isAgent
                  ? "var(--color-accent-bg)"
                  : "var(--color-surface, #fff)",
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <span
                  className="flex items-center gap-1.5 text-sm font-medium"
                  style={{ color: "var(--color-text)" }}
                >
                  {isAgent ? (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
                      </svg>
                      AI 助手
                    </>
                  ) : (
                    "我"
                  )}
                </span>
                <time
                  className="text-xs"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  {formatTime(c.created_at)}
                </time>
              </div>
              <p
                className="text-sm leading-relaxed whitespace-pre-wrap"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {c.content}
              </p>
            </div>
          );
        })}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <div
          className="flex-1 transition-all"
          style={{
            borderRadius: "var(--radius-md)",
            boxShadow: focused ? "var(--shadow-glow)" : "none",
          }}
        >
          <input
            type="text"
            className="input flex-1"
            placeholder="写一条评论..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          />
        </div>
        <button
          type="submit"
          className="btn-primary shrink-0"
          disabled={loading || !content.trim()}
        >
          {loading ? (
            <span
              className="inline-block h-4 w-4 rounded-full border-2 border-white/30 border-t-white"
              style={{ animation: "spin 0.6s linear infinite" }}
            />
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" />
            </svg>
          )}
        </button>
      </form>
    </div>
  );
}
