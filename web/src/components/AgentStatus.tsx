"use client";

import type { AgentTaskResponse } from "@/lib/types";

const statusConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  pending: {
    label: "等待中",
    color: "var(--color-text-tertiary)",
    bgColor: "var(--color-bg-secondary)",
  },
  running: {
    label: "运行中",
    color: "var(--color-warning, #C4943A)",
    bgColor: "rgba(196, 148, 58, 0.08)",
  },
  done: {
    label: "已完成",
    color: "var(--color-success, #5E8A5E)",
    bgColor: "rgba(94, 138, 94, 0.08)",
  },
  failed: {
    label: "失败",
    color: "var(--color-danger, #C4523A)",
    bgColor: "rgba(196, 82, 58, 0.08)",
  },
};

export default function AgentStatus({ tasks }: { tasks: AgentTaskResponse[] }) {
  if (!tasks || tasks.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3
        className="flex items-center gap-2 text-sm font-semibold"
        style={{ color: "var(--color-text-secondary)" }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
        </svg>
        AI 任务
      </h3>
      {tasks.map((task, i) => {
        const st = statusConfig[task.status] || statusConfig.pending;
        return (
          <div
            key={task.id}
            className="animate-fade-in-up p-3"
            style={{
              animationDelay: `${i * 60}ms`,
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              backgroundColor: st.bgColor,
            }}
          >
            <div className="flex items-center justify-between">
              <span
                className="text-sm font-medium"
                style={{ color: "var(--color-text)" }}
              >
                {task.command}
              </span>
              <span
                className="flex items-center gap-1.5 text-xs font-medium"
                style={{ color: st.color }}
              >
                {task.status === "running" && (
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{
                      backgroundColor: st.color,
                      animation: "gentlePulse 1.5s infinite",
                    }}
                  />
                )}
                {task.status === "done" && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
                {st.label}
              </span>
            </div>
            {task.result && (
              <p
                className="mt-1.5 text-sm leading-relaxed"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {task.result}
              </p>
            )}
            {task.error && (
              <p
                className="mt-1.5 text-sm"
                style={{ color: "var(--color-danger, #C4523A)" }}
              >
                {task.error}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
