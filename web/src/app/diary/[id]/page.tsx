"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAuth } from "@/lib/useAuth";
import { getDiary, deleteDiary, getDiaryVersions } from "@/lib/api";
import type { DiaryDetail, CommentResponse } from "@/lib/types";
import type { DiaryVersion } from "@/lib/api";
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

function Skeleton() {
  return (
    <div className="animate-fade-in">
      <div className="skeleton h-8 w-3/5 mb-4" />
      <div className="skeleton h-4 w-40 mb-3" />
      <div className="flex gap-2 mb-8">
        <div className="skeleton h-6 w-16" />
        <div className="skeleton h-6 w-20" />
      </div>
      <div className="space-y-3">
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-4/5" />
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-3/5" />
      </div>
    </div>
  );
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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [versions, setVersions] = useState<DiaryVersion[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<DiaryVersion | null>(null);

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
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        <span className="text-sm">加载中...</span>
      </div>
    );
  }

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteDiary(id);
      router.push("/");
    } catch {
      alert("删除失败");
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-8">
        {loading && <Skeleton />}

        {!loading && !diary && (
          <div className="py-20 text-center animate-fade-in">
            <p
              className="text-lg font-serif font-medium"
              style={{ color: "var(--color-text-secondary)" }}
            >
              日记不存在
            </p>
          </div>
        )}

        {diary && (
          <div className="animate-fade-in-up">
            {/* Header */}
            <div className="mb-8">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => router.push("/")}
                    className="btn-ghost shrink-0"
                    style={{ padding: "6px" }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
                    </svg>
                  </button>
                  <h1
                    className="font-serif text-2xl font-bold leading-tight"
                    style={{ color: "var(--color-text)" }}
                  >
                    {diary.title || "无标题"}
                  </h1>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => router.push(`/diary/${id}/edit`)}
                    className="btn-secondary text-sm"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5">
                      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                    </svg>
                    编辑
                  </button>
                  <div className="relative">
                    <button
                      onClick={() => setShowDeleteConfirm(!showDeleteConfirm)}
                      className="btn-ghost"
                      style={{ color: "var(--color-text-tertiary)" }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                      </svg>
                    </button>
                    {showDeleteConfirm && (
                      <div
                        className="absolute right-0 top-full mt-2 z-50 animate-scale-in p-4"
                        style={{
                          borderRadius: "var(--radius-md)",
                          border: "1px solid var(--color-border)",
                          backgroundColor: "var(--color-surface, #fff)",
                          boxShadow: "var(--shadow-lg)",
                          width: 200,
                        }}
                      >
                        <p className="text-sm mb-3" style={{ color: "var(--color-text)" }}>
                          确定要删除这篇日记吗？
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setShowDeleteConfirm(false)}
                            className="btn-secondary flex-1 text-xs"
                            style={{ padding: "6px 12px" }}
                          >
                            取消
                          </button>
                          <button
                            onClick={handleDelete}
                            disabled={deleting}
                            className="flex-1 text-xs font-medium text-white transition-all"
                            style={{
                              padding: "6px 12px",
                              backgroundColor: "var(--color-danger)",
                              borderRadius: "var(--radius-md)",
                            }}
                          >
                            {deleting ? "删除中..." : "确定删除"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Meta info */}
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm" style={{ color: "var(--color-text-tertiary)" }}>
                <time className="flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                  </svg>
                  {formatDate(diary.created_at)}
                  {diary.updated_at !== diary.created_at && (
                    <span className="opacity-60">（已编辑）</span>
                  )}
                </time>
                {(diary.weather_icon || diary.weather) && (
                  <span>
                    {diary.weather_icon} {diary.weather}
                    {diary.temperature !== undefined && ` ${diary.temperature}°`}
                  </span>
                )}
                {diary.address && (
                  <span className="flex items-center gap-1">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" />
                    </svg>
                    {diary.address}
                  </span>
                )}
              </div>
            </div>

            {/* Tags */}
            {diary.tags.length > 0 && (
              <div className="mb-8 flex flex-wrap gap-2">
                {diary.tags.map((t) => {
                  const isAi = diary.ai_tags?.includes(t);
                  return (
                    <span
                      key={t}
                      className="tag cursor-pointer"
                      style={
                        isAi
                          ? {
                              border: "1px dashed var(--color-primary-light, var(--color-accent))",
                              opacity: 0.85,
                            }
                          : undefined
                      }
                      onClick={() =>
                        router.push(`/tags/${encodeURIComponent(t)}`)
                      }
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
              </div>
            )}

            {/* Divider */}
            <div
              className="mb-8"
              style={{
                height: 1,
                backgroundColor: "var(--color-border)",
              }}
            />

            {/* Content */}
            <article className="prose mb-10">
              {diary.content.includes("<p>") ||
              diary.content.includes("<h") ||
              diary.content.includes("<strong>") ? (
                <div dangerouslySetInnerHTML={{ __html: diary.content }} />
              ) : (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {diary.content}
                </ReactMarkdown>
              )}
            </article>

            {/* References */}
            {(diary.references_out.length > 0 ||
              diary.backlinks.length > 0) && (
              <div
                className="mb-8 p-5 animate-fade-in"
                style={{
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-lg)",
                  backgroundColor: "var(--color-bg-secondary)",
                }}
              >
                {diary.references_out.length > 0 && (
                  <div className="mb-4">
                    <h3
                      className="mb-2 flex items-center gap-1.5 text-sm font-semibold"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      </svg>
                      引用
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {diary.references_out.map((ref) => (
                        <button
                          key={ref.id}
                          onClick={() => router.push(`/diary/${ref.id}`)}
                          className="text-sm font-medium transition-colors"
                          style={{
                            color: "var(--color-primary)",
                            textDecoration: "underline",
                            textUnderlineOffset: "2px",
                          }}
                        >
                          {ref.title || ref.id}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {diary.backlinks.length > 0 && (
                  <div>
                    <h3
                      className="mb-2 flex items-center gap-1.5 text-sm font-semibold"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 17H7A5 5 0 0 1 7 7h2" /><path d="M15 7h2a5 5 0 1 1 0 10h-2" /><line x1="8" x2="16" y1="12" y2="12" />
                      </svg>
                      被引用
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {diary.backlinks.map((ref) => (
                        <button
                          key={ref.id}
                          onClick={() => router.push(`/diary/${ref.id}`)}
                          className="text-sm font-medium transition-colors"
                          style={{
                            color: "var(--color-primary)",
                            textDecoration: "underline",
                            textUnderlineOffset: "2px",
                          }}
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

            {/* Edit history */}
            <div className="mb-8">
              <button
                className="flex items-center gap-2 text-sm font-semibold transition-colors"
                style={{ color: "var(--color-text-secondary)" }}
                onClick={() => {
                  if (!showVersions && versions.length === 0) {
                    getDiaryVersions(id).then(setVersions).catch(console.error);
                  }
                  setShowVersions(!showVersions);
                  setSelectedVersion(null);
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l4 2" />
                </svg>
                编辑历史
                <svg
                  width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  style={{ transform: showVersions ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>

              {showVersions && (
                <div className="mt-3 animate-slide-up">
                  {versions.length === 0 ? (
                    <p className="text-sm" style={{ color: "var(--color-text-tertiary)" }}>
                      暂无编辑记录
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {versions.map((v) => (
                        <button
                          key={v.id}
                          className="w-full text-left p-3 transition-all"
                          style={{
                            border: selectedVersion?.id === v.id
                              ? "1.5px solid var(--color-primary)"
                              : "1px solid var(--color-border)",
                            borderRadius: "var(--radius-md)",
                            backgroundColor: selectedVersion?.id === v.id
                              ? "var(--color-accent-bg)"
                              : "var(--color-surface, #fff)",
                          }}
                          onClick={() => setSelectedVersion(selectedVersion?.id === v.id ? null : v)}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                              {v.title || "无标题"}
                            </span>
                            <time className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>
                              {new Date(v.created_at).toLocaleString("zh-CN", {
                                month: "short", day: "numeric",
                                hour: "2-digit", minute: "2-digit",
                              })}
                            </time>
                          </div>
                          {v.tags.length > 0 && (
                            <div className="mt-1 flex gap-1">
                              {v.tags.map((t) => (
                                <span key={t} className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>#{t}</span>
                              ))}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Show selected version content */}
                  {selectedVersion && (
                    <div
                      className="mt-3 p-4 animate-fade-in"
                      style={{
                        border: "1px solid var(--color-border)",
                        borderRadius: "var(--radius-md)",
                        backgroundColor: "var(--color-bg-secondary)",
                      }}
                    >
                      <p className="text-xs mb-2" style={{ color: "var(--color-text-tertiary)" }}>
                        历史版本内容：
                      </p>
                      <div className="prose text-sm">
                        {selectedVersion.content.includes("<p>") ? (
                          <div dangerouslySetInnerHTML={{ __html: selectedVersion.content }} />
                        ) : (
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {selectedVersion.content}
                          </ReactMarkdown>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Comments */}
            <CommentThread
              entryId={id}
              comments={comments}
              onNewComment={(c) => setComments((prev) => [...prev, c])}
            />
          </div>
        )}
      </main>
    </>
  );
}
