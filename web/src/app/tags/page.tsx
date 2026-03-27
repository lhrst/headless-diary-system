"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import { getTags, getTagTree, setTagHierarchy, removeTagHierarchy, startRetagAll, getRetagStatus } from "@/lib/api";
import type { TagSuggestItem, TagTreeNode } from "@/lib/types";
import Navbar from "@/components/Navbar";

function TreeNodeItem({
  node,
  depth,
  allTags,
  onSetParent,
  onRemoveHierarchy,
  onNavigate,
}: {
  node: TagTreeNode;
  depth: number;
  allTags: TagSuggestItem[];
  onSetParent: (tag: string, parent: string) => void;
  onRemoveHierarchy: (tag: string) => void;
  onNavigate: (tag: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const [showParentSelect, setShowParentSelect] = useState(false);
  const hasChildren = node.children.length > 0;

  return (
    <div style={{ marginLeft: depth > 0 ? 24 : 0 }}>
      <div className="flex items-center gap-2 py-2 group">
        <button
          className="flex h-5 w-5 shrink-0 items-center justify-center transition-transform"
          style={{
            color: "var(--color-text-tertiary)",
            transform: hasChildren && expanded ? "rotate(90deg)" : "rotate(0deg)",
          }}
          onClick={() => setExpanded(!expanded)}
        >
          {hasChildren ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 18 6-6-6-6" />
            </svg>
          ) : (
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: "var(--color-border)" }}
            />
          )}
        </button>

        <button
          className="tag cursor-pointer"
          onClick={() => onNavigate(node.tag)}
        >
          {node.tag}
          <span className="ml-1 opacity-50">{node.count}</span>
        </button>

        <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            className="text-xs px-2 py-0.5 transition-colors"
            style={{
              color: "var(--color-text-tertiary)",
              borderRadius: "var(--radius-sm)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
            onClick={() => setShowParentSelect(!showParentSelect)}
          >
            {depth > 0 ? "移动" : "设置父级"}
          </button>
          {depth > 0 && (
            <button
              className="text-xs px-2 py-0.5 transition-colors"
              style={{
                color: "var(--color-danger)",
                borderRadius: "var(--radius-sm)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor =
                  "rgba(196, 82, 58, 0.06)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
              onClick={() => onRemoveHierarchy(node.tag)}
            >
              解除
            </button>
          )}
        </div>
      </div>

      {showParentSelect && (
        <div
          className="ml-7 mb-3 p-3 animate-scale-in"
          style={{
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            backgroundColor: "var(--color-surface, #fff)",
            maxWidth: 300,
          }}
        >
          <p className="text-xs mb-2" style={{ color: "var(--color-text-secondary)" }}>
            选择「{node.tag}」的父标签：
          </p>
          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
            {allTags
              .filter((t) => t.tag !== node.tag)
              .map((t) => (
                <button
                  key={t.tag}
                  className="tag text-xs cursor-pointer"
                  onClick={() => {
                    onSetParent(node.tag, t.tag);
                    setShowParentSelect(false);
                  }}
                >
                  {t.tag}
                </button>
              ))}
          </div>
          <button
            className="mt-2 text-xs"
            style={{ color: "var(--color-text-tertiary)" }}
            onClick={() => setShowParentSelect(false)}
          >
            取消
          </button>
        </div>
      )}

      {hasChildren && expanded && (
        <div className="animate-slide-up">
          {node.children.map((child) => (
            <TreeNodeItem
              key={child.tag}
              node={child}
              depth={depth + 1}
              allTags={allTags}
              onSetParent={onSetParent}
              onRemoveHierarchy={onRemoveHierarchy}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Retag panel states ── */
type RetagState =
  | { step: "idle" }
  | { step: "confirm"; oldTags: string[] }
  | { step: "running"; phase: string; message: string; current: number; total: number; taxonomy?: Record<string, string[]> }
  | { step: "done"; oldTags: string[]; taxonomy: Record<string, string[]>; updated: number; total: number };

export default function TagsPage() {
  const { mounted, authed } = useAuth();
  const router = useRouter();
  const [tags, setTags] = useState<TagSuggestItem[]>([]);
  const [tree, setTree] = useState<TagTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"cloud" | "tree">("tree");

  // Retag state
  const [retag, setRetag] = useState<RetagState>({ step: "idle" });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(async () => {
    if (!authed) return;
    setLoading(true);
    try {
      const [tagsRes, treeRes] = await Promise.all([getTags(), getTagTree()]);
      setTags(tagsRes.tags);
      setTree(treeRes.tree);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [authed]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const handleRetagClick = () => {
    // Snapshot current tags for before/after comparison
    setRetag({ step: "confirm", oldTags: tags.map((t) => t.tag) });
  };

  const handleRetagConfirm = async () => {
    const oldTags = retag.step === "confirm" ? retag.oldTags : tags.map((t) => t.tag);
    setRetag({ step: "running", phase: "starting", message: "正在启动...", current: 0, total: 0 });

    try {
      const { task_id } = await startRetagAll();

      pollRef.current = setInterval(async () => {
        try {
          const s = await getRetagStatus(task_id);

          if (s.state === "PROGRESS") {
            setRetag({
              step: "running",
              phase: s.phase || "tagging",
              message: s.message || "处理中...",
              current: s.current || 0,
              total: s.total || 0,
              taxonomy: s.taxonomy,
            });
          } else if (s.state === "SUCCESS") {
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
            await loadData();
            setRetag({
              step: "done",
              oldTags,
              taxonomy: s.taxonomy || {},
              updated: s.updated || 0,
              total: s.total || 0,
            });
          } else if (s.state === "FAILURE") {
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
            setRetag({ step: "idle" });
          }
        } catch { /* keep polling */ }
      }, 2000);
    } catch (e) {
      console.error(e);
      setRetag({ step: "idle" });
    }
  };

  const handleSetParent = async (tag: string, parent: string) => {
    try {
      await setTagHierarchy(tag, parent);
      await loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleRemoveHierarchy = async (tag: string) => {
    try {
      await removeTagHierarchy(tag);
      await loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const maxCount = Math.max(...tags.map((t) => t.count), 1);

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

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-8 animate-fade-in">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/")}
              className="btn-ghost"
              style={{ padding: "6px" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
              </svg>
            </button>
            <h1
              className="font-serif text-2xl font-bold"
              style={{ color: "var(--color-text)" }}
            >
              标签
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {retag.step === "idle" && (
              <button
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-all"
                style={{
                  borderRadius: "var(--radius-md)",
                  backgroundColor: "var(--color-accent-bg)",
                  color: "var(--color-accent)",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "var(--shadow-md)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; }}
                onClick={handleRetagClick}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48 2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48 2.83-2.83" />
                </svg>
                AI 重新标签
              </button>
            )}

            <div
              className="flex gap-0.5 p-1"
              style={{
                backgroundColor: "var(--color-bg-secondary)",
                borderRadius: "var(--radius-md)",
              }}
            >
              {[
                { id: "tree" as const, label: "树形" },
                { id: "cloud" as const, label: "云图" },
              ].map((mode) => (
                <button
                  key={mode.id}
                  className="px-3 py-1.5 text-sm font-medium transition-all"
                  style={{
                    borderRadius: "var(--radius-sm)",
                    backgroundColor:
                      viewMode === mode.id ? "var(--color-surface, #fff)" : "transparent",
                    color:
                      viewMode === mode.id
                        ? "var(--color-text)"
                        : "var(--color-text-tertiary)",
                    boxShadow: viewMode === mode.id ? "var(--shadow-sm)" : "none",
                  }}
                  onClick={() => setViewMode(mode.id)}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Retag: Confirm panel ── */}
        {retag.step === "confirm" && (
          <div
            className="mb-6 overflow-hidden animate-fade-in"
            style={{
              borderRadius: "var(--radius-lg)",
              border: "1.5px solid var(--color-primary)",
              backgroundColor: "var(--color-surface, #fff)",
              boxShadow: "var(--shadow-glow)",
            }}
          >
            <div className="p-5">
              <div className="flex items-start gap-3 mb-4">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: "var(--color-accent-bg)" }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48 2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48 2.83-2.83" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-medium mb-1" style={{ color: "var(--color-text)" }}>
                    AI 智能重新标签
                  </h3>
                  <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                    AI 将分析所有日记内容，设计一套层次化的标签体系，并重新标记每篇日记。
                  </p>
                </div>
              </div>

              <div
                className="mb-4 p-3 text-xs"
                style={{
                  borderRadius: "var(--radius-md)",
                  backgroundColor: "var(--color-bg-secondary)",
                  color: "var(--color-text-secondary)",
                }}
              >
                <p className="mb-1 font-medium" style={{ color: "var(--color-text)" }}>当前标签（{retag.oldTags.length} 个）</p>
                <div className="flex flex-wrap gap-1.5">
                  {retag.oldTags.slice(0, 20).map((t) => (
                    <span key={t} className="tag text-xs">{t}</span>
                  ))}
                  {retag.oldTags.length > 20 && (
                    <span className="text-xs opacity-50">+{retag.oldTags.length - 20} 个</span>
                  )}
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  className="btn-secondary text-sm"
                  onClick={() => setRetag({ step: "idle" })}
                >
                  取消
                </button>
                <button
                  className="btn-primary text-sm"
                  onClick={handleRetagConfirm}
                >
                  开始重新标签
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Retag: Running panel ── */}
        {retag.step === "running" && (
          <div
            className="mb-6 overflow-hidden animate-fade-in"
            style={{
              borderRadius: "var(--radius-lg)",
              border: "1.5px solid var(--color-primary)",
              backgroundColor: "var(--color-surface, #fff)",
              boxShadow: "var(--shadow-glow)",
            }}
          >
            <div className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <span
                  className="inline-block h-5 w-5 rounded-full border-2 border-t-transparent"
                  style={{ borderColor: "var(--color-primary)", borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }}
                />
                <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                  {retag.message}
                </p>
              </div>

              {/* Progress bar */}
              {retag.total > 0 && (
                <div className="mb-4">
                  <div className="flex justify-between text-xs mb-1.5" style={{ color: "var(--color-text-tertiary)" }}>
                    <span>{retag.phase === "taxonomy" ? "设计标签体系" : "标记日记"}</span>
                    <span>{retag.current}/{retag.total}</span>
                  </div>
                  <div
                    className="h-2 w-full overflow-hidden"
                    style={{ borderRadius: 99, backgroundColor: "var(--color-bg-secondary)" }}
                  >
                    <div
                      className="h-full transition-all duration-700 ease-out"
                      style={{
                        width: `${Math.round((retag.current / retag.total) * 100)}%`,
                        backgroundColor: "var(--color-primary)",
                        borderRadius: 99,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Show taxonomy preview as it's designed */}
              {retag.taxonomy && Object.keys(retag.taxonomy).length > 0 && (
                <div
                  className="p-3 animate-fade-in"
                  style={{
                    borderRadius: "var(--radius-md)",
                    backgroundColor: "var(--color-bg-secondary)",
                  }}
                >
                  <p className="text-xs font-medium mb-2" style={{ color: "var(--color-text)" }}>
                    设计的标签体系
                  </p>
                  {Object.entries(retag.taxonomy).map(([parent, children], i) => (
                    <div key={parent} className="mb-2 last:mb-0 animate-fade-in-up" style={{ animationDelay: `${i * 100}ms` }}>
                      <span className="text-sm font-medium" style={{ color: "var(--color-accent)" }}>
                        {parent}
                      </span>
                      <div className="flex flex-wrap gap-1 mt-1 ml-4">
                        {children.map((c, j) => (
                          <span
                            key={c}
                            className="tag text-xs animate-fade-in-up"
                            style={{ animationDelay: `${i * 100 + j * 50}ms` }}
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Retag: Done panel ── */}
        {retag.step === "done" && (
          <div
            className="mb-6 overflow-hidden animate-fade-in"
            style={{
              borderRadius: "var(--radius-lg)",
              border: "1.5px solid var(--color-primary)",
              backgroundColor: "var(--color-surface, #fff)",
              boxShadow: "var(--shadow-glow)",
            }}
          >
            <div className="p-5">
              {/* Header */}
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full"
                  style={{ backgroundColor: "var(--color-accent-bg)" }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                    重新标签完成
                  </p>
                  <p className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>
                    已标记 {retag.updated}/{retag.total} 篇日记
                  </p>
                </div>
              </div>

              {/* Before / After comparison */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div
                  className="p-3"
                  style={{
                    borderRadius: "var(--radius-md)",
                    backgroundColor: "var(--color-bg-secondary)",
                  }}
                >
                  <p className="text-xs font-medium mb-2" style={{ color: "var(--color-text-tertiary)" }}>
                    旧标签（{retag.oldTags.length} 个）
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {retag.oldTags.slice(0, 15).map((t) => (
                      <span key={t} className="text-xs px-2 py-0.5" style={{
                        borderRadius: "var(--radius-sm)",
                        backgroundColor: "var(--color-bg-hover)",
                        color: "var(--color-text-tertiary)",
                        textDecoration: "line-through",
                        opacity: 0.6,
                      }}>
                        {t}
                      </span>
                    ))}
                    {retag.oldTags.length > 15 && (
                      <span className="text-xs opacity-40">+{retag.oldTags.length - 15}</span>
                    )}
                  </div>
                </div>

                <div
                  className="p-3"
                  style={{
                    borderRadius: "var(--radius-md)",
                    backgroundColor: "var(--color-accent-bg)",
                  }}
                >
                  <p className="text-xs font-medium mb-2" style={{ color: "var(--color-accent)" }}>
                    新标签体系
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(retag.taxonomy).map(([parent, children]) => (
                      [parent, ...children].map((t) => (
                        <span key={t} className="tag text-xs">{t}</span>
                      ))
                    )).flat().slice(0, 15)}
                    {Object.values(retag.taxonomy).flat().length + Object.keys(retag.taxonomy).length > 15 && (
                      <span className="text-xs" style={{ color: "var(--color-accent)", opacity: 0.6 }}>
                        +{Object.values(retag.taxonomy).flat().length + Object.keys(retag.taxonomy).length - 15}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Taxonomy tree preview */}
              <div
                className="p-3 mb-4"
                style={{
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--color-border)",
                }}
              >
                <p className="text-xs font-medium mb-2" style={{ color: "var(--color-text)" }}>层次结构</p>
                {Object.entries(retag.taxonomy).map(([parent, children], i) => (
                  <div key={parent} className="mb-2 last:mb-0 animate-fade-in-up" style={{ animationDelay: `${i * 80}ms` }}>
                    <div className="flex items-center gap-1.5">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m9 18 6-6-6-6" />
                      </svg>
                      <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>{parent}</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1 ml-5">
                      {children.map((c, j) => (
                        <span
                          key={c}
                          className="tag text-xs animate-fade-in-up"
                          style={{ animationDelay: `${i * 80 + j * 40}ms` }}
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <button
                className="btn-secondary text-sm w-full"
                onClick={() => setRetag({ step: "idle" })}
              >
                关闭
              </button>
            </div>
          </div>
        )}

        {loading && (
          <div className="space-y-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-2 animate-fade-in-up" style={{ animationDelay: `${i * 60}ms` }}>
                <div className="skeleton h-5 w-5 rounded-full" />
                <div className="skeleton h-7 w-20" />
              </div>
            ))}
          </div>
        )}

        {!loading && tags.length === 0 && retag.step === "idle" && (
          <div className="py-16 text-center">
            <div
              className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl"
              style={{ backgroundColor: "var(--color-accent-bg)" }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2 2 7l10 5 10-5-10-5Z" /><path d="m2 17 10 5 10-5" /><path d="m2 12 10 5 10-5" />
              </svg>
            </div>
            <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
              暂无标签
            </p>
          </div>
        )}

        {!loading && tags.length > 0 && viewMode === "cloud" && (
          <div className="flex flex-wrap gap-3 animate-fade-in">
            {tags.map((t, i) => {
              const ratio = t.count / maxCount;
              const size = 0.875 + ratio * 0.75;
              return (
                <button
                  key={t.tag}
                  onClick={() =>
                    router.push(`/tags/${encodeURIComponent(t.tag)}`)
                  }
                  className="font-medium transition-all animate-fade-in-up"
                  style={{
                    animationDelay: `${i * 40}ms`,
                    fontSize: `${size}rem`,
                    padding: "6px 14px",
                    backgroundColor: "var(--color-accent-bg)",
                    color: "var(--color-accent)",
                    borderRadius: "var(--radius-md)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "scale(1.05)";
                    e.currentTarget.style.boxShadow = "var(--shadow-md)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "scale(1)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  {t.tag}
                  <span className="ml-1 text-xs opacity-50">{t.count}</span>
                </button>
              );
            })}
          </div>
        )}

        {!loading && tags.length > 0 && viewMode === "tree" && (
          <div className="animate-fade-in">
            {tree.map((node) => (
              <TreeNodeItem
                key={node.tag}
                node={node}
                depth={0}
                allTags={tags}
                onSetParent={handleSetParent}
                onRemoveHierarchy={handleRemoveHierarchy}
                onNavigate={(tag) =>
                  router.push(`/tags/${encodeURIComponent(tag)}`)
                }
              />
            ))}
          </div>
        )}
      </main>

      <style jsx global>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
