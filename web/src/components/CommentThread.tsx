"use client";

import { useState } from "react";
import type { CommentResponse } from "@/lib/types";
import { createComment } from "@/lib/api";

function formatTime(iso: string): string {
  const d = new Date(iso);
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
      <h3 className="text-sm font-semibold"
        style={{ color: "var(--color-text-secondary)" }}>
        评论 ({comments.length})
      </h3>

      {comments.length === 0 && (
        <p className="text-sm" style={{ color: "var(--color-text-tertiary)" }}>
          暂无评论
        </p>
      )}

      <div className="space-y-3">
        {comments.map((c) => (
          <div key={c.id} className="rounded-lg border p-3"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: c.author_role === "agent"
                ? "var(--color-accent-bg)"
                : "var(--color-bg-secondary)",
            }}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                {c.author_id}
                {c.author_role === "agent" && (
                  <span className="ml-1.5 text-xs rounded px-1 py-0.5"
                    style={{
                      backgroundColor: "var(--color-primary)",
                      color: "#fff",
                    }}>
                    AI
                  </span>
                )}
              </span>
              <time className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>
                {formatTime(c.created_at)}
              </time>
            </div>
            <p className="text-sm leading-relaxed whitespace-pre-wrap"
              style={{ color: "var(--color-text-secondary)" }}>
              {c.content}
            </p>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          className="input flex-1"
          placeholder="写一条评论..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <button type="submit" className="btn-primary shrink-0" disabled={loading}>
          {loading ? "发送中..." : "发送"}
        </button>
      </form>
    </div>
  );
}
