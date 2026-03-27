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

export default function TagsPage() {
  const { mounted, authed } = useAuth();
  const router = useRouter();
  const [tags, setTags] = useState<TagSuggestItem[]>([]);
  const [tree, setTree] = useState<TagTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"cloud" | "tree">("tree");

  // Retag state
  const [retagging, setRetagging] = useState(false);
  const [retagMessage, setRetagMessage] = useState("");
  const [retagProgress, setRetagProgress] = useState<{ current: number; total: number } | null>(null);
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

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleRetagAll = async () => {
    if (retagging) return;
    if (!confirm("这将用 AI 重新设计标签体系并重新标记所有日记。已有的 AI 标签会被替换，手动标签保留。确定继续？")) return;

    setRetagging(true);
    setRetagMessage("正在启动...");
    setRetagProgress(null);

    try {
      const { task_id } = await startRetagAll();

      pollRef.current = setInterval(async () => {
        try {
          const status = await getRetagStatus(task_id);
          setRetagMessage(status.message || "处理中...");

          if (status.current !== undefined && status.total !== undefined) {
            setRetagProgress({ current: status.current, total: status.total });
          }

          if (status.state === "SUCCESS" || status.state === "FAILURE") {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setRetagging(false);
            if (status.state === "SUCCESS") {
              await loadData();
            }
            // Keep message visible for a few seconds
            setTimeout(() => {
              setRetagMessage("");
              setRetagProgress(null);
            }, 5000);
          }
        } catch {
          // Keep polling on transient errors
        }
      }, 2000);
    } catch (e) {
      console.error(e);
      setRetagging(false);
      setRetagMessage("启动失败");
      setTimeout(() => setRetagMessage(""), 3000);
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
            {/* Retag button */}
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-all"
              style={{
                borderRadius: "var(--radius-md)",
                backgroundColor: retagging ? "var(--color-bg-secondary)" : "var(--color-accent-bg)",
                color: retagging ? "var(--color-text-tertiary)" : "var(--color-accent)",
                opacity: retagging ? 0.7 : 1,
              }}
              onClick={handleRetagAll}
              disabled={retagging}
            >
              {retagging ? (
                <span
                  className="inline-block h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent"
                  style={{ animation: "spin 0.6s linear infinite" }}
                />
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48 2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48 2.83-2.83" />
                </svg>
              )}
              AI 重新标签
            </button>

            {/* View mode toggle */}
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

        {/* Retag progress */}
        {retagMessage && (
          <div
            className="mb-6 p-4 animate-fade-in"
            style={{
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-border)",
              backgroundColor: "var(--color-surface, #fff)",
            }}
          >
            <p className="text-sm mb-2" style={{ color: "var(--color-text-secondary)" }}>
              {retagMessage}
            </p>
            {retagProgress && retagProgress.total > 0 && (
              <div
                className="h-2 w-full overflow-hidden"
                style={{
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: "var(--color-bg-secondary)",
                }}
              >
                <div
                  className="h-full transition-all duration-500"
                  style={{
                    width: `${Math.round((retagProgress.current / retagProgress.total) * 100)}%`,
                    backgroundColor: "var(--color-primary)",
                    borderRadius: "var(--radius-sm)",
                  }}
                />
              </div>
            )}
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

        {!loading && tags.length === 0 && (
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
    </>
  );
}
