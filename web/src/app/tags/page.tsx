"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import { getTags, getTagTree, setTagHierarchy, removeTagHierarchy } from "@/lib/api";
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
    <div style={{ marginLeft: depth > 0 ? 20 : 0 }}>
      <div className="flex items-center gap-2 py-1.5 group">
        {/* Expand/collapse toggle */}
        <button
          className="w-5 h-5 flex items-center justify-center text-xs shrink-0"
          style={{ color: "var(--color-text-tertiary)" }}
          onClick={() => setExpanded(!expanded)}
        >
          {hasChildren ? (expanded ? "\u25BC" : "\u25B6") : "\u00B7"}
        </button>

        {/* Tag name */}
        <button
          className="rounded-lg px-2.5 py-1 font-medium transition-colors text-sm"
          style={{
            backgroundColor: "var(--color-accent-bg)",
            color: "var(--color-accent)",
          }}
          onClick={() => onNavigate(node.tag)}
        >
          {node.tag}
          <span className="ml-1 text-xs opacity-60">{node.count}</span>
        </button>

        {/* Actions (visible on hover) */}
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
          <button
            className="text-xs px-1.5 py-0.5 rounded"
            style={{ color: "var(--color-text-tertiary)" }}
            onClick={() => setShowParentSelect(!showParentSelect)}
            title="Set parent tag"
          >
            {depth > 0 ? "Move" : "Set Parent"}
          </button>
          {depth > 0 && (
            <button
              className="text-xs px-1.5 py-0.5 rounded"
              style={{ color: "var(--color-danger, #ef4444)" }}
              onClick={() => onRemoveHierarchy(node.tag)}
              title="Remove from parent"
            >
              Detach
            </button>
          )}
        </div>
      </div>

      {/* Parent selection dropdown */}
      {showParentSelect && (
        <div
          className="ml-7 mb-2 p-2 rounded-lg border text-sm"
          style={{ borderColor: "var(--color-border)", maxWidth: 300 }}
        >
          <p className="text-xs mb-1" style={{ color: "var(--color-text-secondary)" }}>
            Select parent for &quot;{node.tag}&quot;:
          </p>
          <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
            {allTags
              .filter((t) => t.tag !== node.tag)
              .map((t) => (
                <button
                  key={t.tag}
                  className="text-xs px-2 py-0.5 rounded-md"
                  style={{
                    backgroundColor: "var(--color-accent-bg)",
                    color: "var(--color-accent)",
                  }}
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
            className="mt-1 text-xs"
            style={{ color: "var(--color-text-tertiary)" }}
            onClick={() => setShowParentSelect(false)}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Children */}
      {hasChildren && expanded && (
        <div>
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

  const handleSetParent = async (tag: string, parent: string) => {
    try {
      await setTagHierarchy(tag, parent);
      await loadData();
    } catch (e) {
      console.error(e);
      alert("Failed to set parent tag");
    }
  };

  const handleRemoveHierarchy = async (tag: string) => {
    try {
      await removeTagHierarchy(tag);
      await loadData();
    } catch (e) {
      console.error(e);
      alert("Failed to remove hierarchy");
    }
  };

  const maxCount = Math.max(...tags.map((t) => t.count), 1);

  if (!mounted) {
    return <div className="py-20 text-center text-sm">Loading...</div>;
  }

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-bold" style={{ color: "var(--color-text)" }}>
            Tags
          </h1>
          <div className="flex gap-1 rounded-lg p-0.5" style={{ backgroundColor: "var(--color-accent-bg)" }}>
            <button
              className="px-3 py-1 text-sm rounded-md transition-colors"
              style={{
                backgroundColor: viewMode === "tree" ? "var(--color-accent)" : "transparent",
                color: viewMode === "tree" ? "white" : "var(--color-accent)",
              }}
              onClick={() => setViewMode("tree")}
            >
              Tree
            </button>
            <button
              className="px-3 py-1 text-sm rounded-md transition-colors"
              style={{
                backgroundColor: viewMode === "cloud" ? "var(--color-accent)" : "transparent",
                color: viewMode === "cloud" ? "white" : "var(--color-accent)",
              }}
              onClick={() => setViewMode("cloud")}
            >
              Cloud
            </button>
          </div>
        </div>

        {loading && (
          <div className="py-12 text-center text-sm"
            style={{ color: "var(--color-text-tertiary)" }}>
            Loading...
          </div>
        )}

        {!loading && tags.length === 0 && (
          <p className="py-12 text-center text-sm"
            style={{ color: "var(--color-text-secondary)" }}>
            No tags yet
          </p>
        )}

        {!loading && tags.length > 0 && viewMode === "cloud" && (
          <div className="flex flex-wrap gap-3">
            {tags.map((t) => {
              const ratio = t.count / maxCount;
              const size = 0.875 + ratio * 0.75;
              return (
                <button
                  key={t.tag}
                  onClick={() => router.push(`/tags/${encodeURIComponent(t.tag)}`)}
                  className="rounded-lg px-3 py-1.5 font-medium transition-colors"
                  style={{
                    fontSize: `${size}rem`,
                    backgroundColor: "var(--color-accent-bg)",
                    color: "var(--color-accent)",
                  }}
                >
                  {t.tag}
                  <span className="ml-1 text-xs opacity-60">{t.count}</span>
                </button>
              );
            })}
          </div>
        )}

        {!loading && tags.length > 0 && viewMode === "tree" && (
          <div>
            {tree.map((node) => (
              <TreeNodeItem
                key={node.tag}
                node={node}
                depth={0}
                allTags={tags}
                onSetParent={handleSetParent}
                onRemoveHierarchy={handleRemoveHierarchy}
                onNavigate={(tag) => router.push(`/tags/${encodeURIComponent(tag)}`)}
              />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
