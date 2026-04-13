"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { CommentResponse, AgentTaskResponse } from "@/lib/types";
import { createComment, getComments, getAgentTasksByEntry } from "@/lib/api";

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
  agentTasks?: AgentTaskResponse[];
  onNewComment?: (c: CommentResponse) => void;
  onTasksUpdate?: (tasks: AgentTaskResponse[]) => void;
}

export default function CommentThread({
  entryId,
  comments: initialComments,
  agentTasks: initialTasks,
  onNewComment,
  onTasksUpdate,
}: Props) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const [comments, setComments] = useState(initialComments);
  const [pendingTasks, setPendingTasks] = useState<AgentTaskResponse[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  // Sync with parent
  useEffect(() => {
    setComments(initialComments);
  }, [initialComments]);

  // Check if there are pending/running tasks that need polling
  const hasPendingTasks = useCallback(() => {
    const tasks = initialTasks || [];
    return tasks.some((t) => t.status === "pending" || t.status === "running");
  }, [initialTasks]);

  // Poll for updates when there are pending/running tasks
  useEffect(() => {
    if (!hasPendingTasks() && pendingTasks.length === 0) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    const poll = async () => {
      try {
        const [newTasks, newComments] = await Promise.all([
          getAgentTasksByEntry(entryId),
          getComments(entryId),
        ]);
        const stillPending = newTasks.filter(
          (t) => t.status === "pending" || t.status === "running"
        );
        setPendingTasks(stillPending);
        setComments(newComments);
        onTasksUpdate?.(newTasks);

        // Stop polling if no more pending tasks
        if (stillPending.length === 0 && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch {
        // Ignore polling errors
      }
    };

    pollRef.current = setInterval(poll, 5000);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [entryId, hasPendingTasks, pendingTasks.length, onTasksUpdate]);

  // Auto-scroll when new comments arrive
  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments.length]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || loading) return;
    setLoading(true);
    try {
      const c = await createComment(entryId, content.trim());
      setContent("");
      setComments((prev) => [...prev, c]);
      onNewComment?.(c);

      // If the comment contains @agent, start polling
      if (/@agent\s+/i.test(content)) {
        setPendingTasks([{ id: "temp", status: "pending" } as AgentTaskResponse]);
      }
    } catch (err) {
      console.error("Failed to create comment:", err);
    } finally {
      setLoading(false);
    }
  };

  const isAgentCommand = content.trim().toLowerCase().startsWith("@agent");

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

      {comments.length === 0 && pendingTasks.length === 0 && (
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
              className="animate-fade-in-up flex gap-3 p-4"
              style={{
                animationDelay: `${i * 60}ms`,
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                backgroundColor: isAgent
                  ? "var(--color-accent-bg)"
                  : "var(--color-surface, #fff)",
              }}
            >
              {/* Avatar */}
              <span
                className="shrink-0 flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold"
                title={isAgent ? "AI 助手" : "我"}
                style={{
                  backgroundColor: isAgent
                    ? "var(--color-surface, #fff)"
                    : "var(--color-primary)",
                  color: isAgent ? "var(--color-primary)" : "#fff",
                  border: isAgent
                    ? "1.5px solid var(--color-primary)"
                    : "none",
                }}
              >
                {isAgent ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
                  </svg>
                ) : (
                  "我"
                )}
              </span>

              {/* Content */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span
                    className="text-sm font-medium"
                    style={{ color: "var(--color-text)" }}
                  >
                    {isAgent ? "AI 助手" : "我"}
                  </span>
                  <time
                    className="text-xs"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    {formatTime(c.created_at)}
                  </time>
                </div>
                <p
                  className="text-sm leading-relaxed whitespace-pre-wrap break-words"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {c.content}
                </p>
              </div>
            </div>
          );
        })}

        {/* Agent thinking indicator */}
        {pendingTasks.length > 0 && (
          <div
            className="animate-fade-in-up p-4"
            style={{
              border: "1px dashed var(--color-primary-light, var(--color-accent))",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--color-accent-bg)",
            }}
          >
            <div className="flex items-center gap-2">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
              </svg>
              <span
                className="text-sm font-medium"
                style={{ color: "var(--color-primary)" }}
              >
                AI 助手正在思考...
              </span>
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{
                  backgroundColor: "var(--color-primary)",
                  animation: "gentlePulse 1.5s infinite",
                }}
              />
            </div>
          </div>
        )}

        <div ref={commentsEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="space-y-2">
        {/* @agent hint */}
        {isAgentCommand && (
          <div
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 animate-fade-in"
            style={{
              color: "var(--color-primary)",
              backgroundColor: "var(--color-accent-bg)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
            </svg>
            将作为 AI 指令发送
          </div>
        )}
        <div className="flex gap-2">
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
              placeholder="写评论... 输入 @agent 向 AI 提问"
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
        </div>
      </form>
    </div>
  );
}
