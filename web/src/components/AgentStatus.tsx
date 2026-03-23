"use client";

import type { AgentTaskResponse } from "@/lib/types";

const statusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: "等待中", color: "var(--color-text-tertiary)" },
  running: { label: "运行中", color: "var(--color-warning, #f59e0b)" },
  done: { label: "已完成", color: "var(--color-success, #22c55e)" },
  failed: { label: "失败", color: "var(--color-danger, #ef4444)" },
};

export default function AgentStatus({ tasks }: { tasks: AgentTaskResponse[] }) {
  if (!tasks || tasks.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold"
        style={{ color: "var(--color-text-secondary)" }}>
        Agent 任务
      </h3>
      {tasks.map((task) => {
        const st = statusLabels[task.status] || statusLabels.pending;
        return (
          <div key={task.id} className="rounded-lg border p-3"
            style={{ borderColor: "var(--color-border)" }}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                {task.command}
              </span>
              <span className="flex items-center gap-1.5 text-xs font-medium"
                style={{ color: st.color }}>
                {task.status === "running" && (
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full"
                    style={{ backgroundColor: st.color }} />
                )}
                {st.label}
              </span>
            </div>
            {task.result && (
              <p className="mt-1 text-sm"
                style={{ color: "var(--color-text-secondary)" }}>
                {task.result}
              </p>
            )}
            {task.error && (
              <p className="mt-1 text-sm"
                style={{ color: "var(--color-danger, #ef4444)" }}>
                {task.error}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
