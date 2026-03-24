"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAuth } from "@/lib/useAuth";
import { getDiary, deleteDiary } from "@/lib/api";
import type { DiaryDetail, CommentResponse } from "@/lib/types";
import Navbar from "@/components/Navbar";
import CommentThread from "@/components/CommentThread";
import AgentStatus from "@/components/AgentStatus";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DiaryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { mounted, authed } = useAuth();

  const [diary, setDiary] = useState<DiaryDetail | null>(null);
  const [comments, setComments] = useState<CommentResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!authed) return;
    getDiary(id)
      .then((d) => {
        setDiary(d);
        setComments(d.comments || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id, authed]);

  if (!mounted) {
    return <div className="py-20 text-center text-sm">加载中...</div>;
  }

  const handleDelete = async () => {
    if (!confirm("确定要删除这篇日记吗？")) return;
    setDeleting(true);
    try {
      await deleteDiary(id);
      router.push("/");
    } catch {
      alert("删除失败");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="py-20 text-center text-sm"
          style={{ color: "var(--color-text-tertiary)" }}>
          加载中...
        </div>
      </>
    );
  }

  if (!diary) {
    return (
      <>
        <Navbar />
        <div className="py-20 text-center">
          <p className="text-lg font-medium"
            style={{ color: "var(--color-text-secondary)" }}>
            日记不存在
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-2xl font-bold leading-tight"
              style={{ color: "var(--color-text)" }}>
              {diary.title || "无标题"}
            </h1>
            <div className="flex shrink-0 gap-2">
              <button
                onClick={() => router.push(`/diary/${id}/edit`)}
                className="btn-secondary"
              >
                编辑
              </button>
              <button
                onClick={handleDelete}
                className="btn-ghost"
                style={{ color: "var(--color-danger, #ef4444)" }}
                disabled={deleting}
              >
                删除
              </button>
            </div>
          </div>
          <time className="mt-2 block text-sm"
            style={{ color: "var(--color-text-tertiary)" }}>
            {formatDate(diary.created_at)}
            {diary.updated_at !== diary.created_at && (
              <span> (编辑于 {formatDate(diary.updated_at)})</span>
            )}
          </time>
          {(diary.weather || diary.weather_icon || diary.address) && (
            <p className="mt-1 text-sm"
              style={{ color: "var(--color-text-tertiary)" }}>
              {diary.weather_icon && <span>{diary.weather_icon} </span>}
              {diary.weather && <span>{diary.weather} </span>}
              {diary.temperature !== undefined && (
                <span>{diary.temperature}°C </span>
              )}
              {diary.address && (
                <span>
                  {(diary.weather || diary.weather_icon || diary.temperature !== undefined) ? "· " : ""}
                  {diary.address}
                </span>
              )}
            </p>
          )}
        </div>

        {/* Tags */}
        {diary.tags.length > 0 && (
          <div className="mb-6 flex flex-wrap gap-1.5">
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
                  onClick={() => router.push(`/tags/${encodeURIComponent(t)}`)}
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
        )}

        {/* Content */}
        <article className="prose mb-8">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {diary.content}
          </ReactMarkdown>
        </article>

        {/* References */}
        {(diary.references_out.length > 0 || diary.backlinks.length > 0) && (
          <div className="mb-8 rounded-xl border p-4"
            style={{ borderColor: "var(--color-border)" }}>
            {diary.references_out.length > 0 && (
              <div className="mb-3">
                <h3 className="mb-2 text-sm font-semibold"
                  style={{ color: "var(--color-text-secondary)" }}>
                  引用
                </h3>
                <div className="flex flex-wrap gap-2">
                  {diary.references_out.map((ref) => (
                    <button
                      key={ref.id}
                      onClick={() => router.push(`/diary/${ref.id}`)}
                      className="btn-ghost text-xs underline"
                      style={{ color: "var(--color-primary)" }}
                    >
                      {ref.title || ref.id}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {diary.backlinks.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold"
                  style={{ color: "var(--color-text-secondary)" }}>
                  被引用
                </h3>
                <div className="flex flex-wrap gap-2">
                  {diary.backlinks.map((ref) => (
                    <button
                      key={ref.id}
                      onClick={() => router.push(`/diary/${ref.id}`)}
                      className="btn-ghost text-xs underline"
                      style={{ color: "var(--color-primary)" }}
                    >
                      {ref.title || ref.id}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Agent tasks */}
        <div className="mb-8">
          <AgentStatus tasks={diary.agent_tasks} />
        </div>

        {/* Comments */}
        <CommentThread
          entryId={id}
          comments={comments}
          onNewComment={(c) => setComments((prev) => [...prev, c])}
        />
      </main>
    </>
  );
}
