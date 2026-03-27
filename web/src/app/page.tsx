"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import { getDiaries, getTags, createDiary } from "@/lib/api";
import type { DiaryBrief, TagSuggestItem } from "@/lib/types";
import DiaryCard from "@/components/DiaryCard";
import Navbar from "@/components/Navbar";
import dynamic from "next/dynamic";

const Editor = dynamic(() => import("@/components/Editor"), { ssr: false });

/* ── Skeleton Card ── */
function SkeletonCard({ delay = 0 }: { delay?: number }) {
  return (
    <div
      className="card animate-fade-in-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="skeleton h-5 w-3/5 mb-3" />
          <div className="skeleton h-4 w-full mb-1.5" />
          <div className="skeleton h-4 w-4/5" />
        </div>
        <div className="skeleton h-4 w-16" />
      </div>
      <div className="mt-3 flex gap-1.5">
        <div className="skeleton h-6 w-14" />
        <div className="skeleton h-6 w-18" />
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div
          className="flex min-h-screen items-center justify-center"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          <span className="text-sm">加载中...</span>
        </div>
      }
    >
      <HomePageInner />
    </Suspense>
  );
}

function HomePageInner() {
  const { mounted, authed } = useAuth();
  const searchParams = useSearchParams();
  const qParam = searchParams.get("q") || "";
  const tagParam = searchParams.get("tag") || "";

  const [diaries, setDiaries] = useState<DiaryBrief[]>([]);
  const [tags, setTags] = useState<TagSuggestItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(qParam);
  const [activeTag, setActiveTag] = useState(tagParam);
  const [quickContent, setQuickContent] = useState("");
  const [quickTitle, setQuickTitle] = useState("");
  const [editorExpanded, setEditorExpanded] = useState(true);
  const [userLat, setUserLat] = useState<number | undefined>();
  const [userLng, setUserLng] = useState<number | undefined>();
  const [newDiaryIds, setNewDiaryIds] = useState<Set<string>>(new Set());

  const editorKeyRef = useRef(0);

  // Request geolocation on mount
  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLat(pos.coords.latitude);
          setUserLng(pos.coords.longitude);
        },
        () => {},
      );
    }
  }, []);

  const loadDiaries = useCallback(
    async (p: number, append = false) => {
      setLoading(true);
      try {
        const res = await getDiaries({
          page: p,
          per_page: 20,
          q: search || undefined,
          tag: activeTag || undefined,
        });
        setDiaries((prev) => (append ? [...prev, ...res.items] : res.items));
        setHasNext(res.items.length >= 20 && res.total > p * 20);
        setPage(p);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    },
    [search, activeTag],
  );

  useEffect(() => {
    if (!authed) return;
    loadDiaries(1);
    getTags()
      .then((res) => setTags(res.tags))
      .catch(console.error);
  }, [authed, loadDiaries]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadDiaries(1);
  };

  /* ── Optimistic Publish ── */
  const handleQuickPublish = async () => {
    const contentToPublish = quickContent;
    if (!contentToPublish.trim()) return;

    const tempId = `temp-${Date.now()}`;
    const now = new Date().toISOString();

    // Create optimistic placeholder
    const placeholder: DiaryBrief = {
      id: tempId,
      title: "",
      title_source: "pending",
      tags: [],
      ai_tags: [],
      preview: contentToPublish.replace(/<[^>]+>/g, "").slice(0, 100),
      created_at: now,
      updated_at: now,
    };

    // Immediately show placeholder and clear editor
    setDiaries((prev) => [placeholder, ...prev]);
    setQuickContent("");
    setQuickTitle("");
    setEditorExpanded(false);
    editorKeyRef.current += 1;

    try {
      const result = await createDiary(
        contentToPublish,
        quickTitle || undefined,
        userLat,
        userLng,
      );

      // Replace placeholder with real data
      setDiaries((prev) =>
        prev.map((d) => (d.id === tempId ? { ...result, preview: result.content.replace(/<[^>]+>/g, "").slice(0, 100) } : d)),
      );
      setNewDiaryIds((prev) => new Set(prev).add(result.id));

      // Clear "new" highlight after animation
      setTimeout(() => {
        setNewDiaryIds((prev) => {
          const next = new Set(prev);
          next.delete(result.id);
          return next;
        });
      }, 2000);
    } catch (err) {
      console.error(err);
      // Remove placeholder on failure
      setDiaries((prev) => prev.filter((d) => d.id !== tempId));
      // Restore content
      setQuickContent(contentToPublish);
      setEditorExpanded(true);
    }
  };

  const handleTagClick = (tag: string) => {
    const next = activeTag === tag ? "" : tag;
    setActiveTag(next);
    setTimeout(() => loadDiaries(1), 0);
  };

  if (!mounted) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        <div className="flex items-center gap-3">
          <span
            className="inline-block h-5 w-5 rounded-full border-2 border-current border-t-transparent"
            style={{ animation: "spin 0.8s linear infinite" }}
          />
          <span className="text-sm">加载中...</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-8">
        {/* Quick publish */}
        {authed && (
          <div
            className="mb-8 animate-fade-in-up overflow-hidden transition-all"
            style={{
              border: "1.5px solid var(--color-border)",
              borderRadius: "var(--radius-xl)",
              backgroundColor: "var(--color-surface, #fff)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            {/* Collapsed state — just a clickable prompt */}
            {!editorExpanded && (
              <button
                className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors"
                style={{ color: "var(--color-text-tertiary)" }}
                onClick={() => setEditorExpanded(true)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ opacity: 0.5 }}
                >
                  <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  <path d="m15 5 4 4" />
                </svg>
                <span className="text-sm">记录一下今天的想法...</span>
              </button>
            )}

            {/* Expanded state — full editor */}
            {editorExpanded && (
              <div className="animate-fade-in p-4">
                <input
                  type="text"
                  className="input mb-3"
                  placeholder="标题（可选，AI 会自动生成）"
                  value={quickTitle}
                  onChange={(e) => setQuickTitle(e.target.value)}
                  style={{
                    border: "none",
                    backgroundColor: "var(--color-bg-secondary)",
                    fontFamily: "'Lora', 'Noto Serif SC', serif",
                    fontSize: "15px",
                  }}
                />
                <Editor
                  key={editorKeyRef.current}
                  placeholder="记录一下..."
                  onChange={(html) => setQuickContent(html)}
                  onSubmit={handleQuickPublish}
                  enableUpload
                />
                <div className="mt-3 flex items-center justify-between">
                  <button
                    onClick={() => setEditorExpanded(false)}
                    className="btn-ghost text-xs"
                  >
                    收起
                  </button>
                  <button
                    onClick={handleQuickPublish}
                    className="btn-primary"
                    disabled={!quickContent.trim()}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="mr-1.5"
                    >
                      <path d="m22 2-7 20-4-9-9-4Z" />
                      <path d="M22 2 11 13" />
                    </svg>
                    发布
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Search */}
        <form onSubmit={handleSearch} className="mb-6 animate-fade-in-up" style={{ animationDelay: "60ms" }}>
          <div className="relative">
            <svg
              className="absolute left-3.5 top-1/2 -translate-y-1/2"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-text-tertiary)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              className="input pl-10"
              placeholder="搜索日记内容..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </form>

        {/* Tag filter */}
        {tags.length > 0 && (
          <div className="mb-6 flex flex-wrap gap-2 animate-fade-in-up" style={{ animationDelay: "120ms" }}>
            {tags.map((t) => (
              <button
                key={t.tag}
                onClick={() => handleTagClick(t.tag)}
                className="tag cursor-pointer transition-all"
                style={{
                  backgroundColor:
                    activeTag === t.tag
                      ? "var(--color-primary)"
                      : "var(--color-accent-bg)",
                  color:
                    activeTag === t.tag ? "#fff" : "var(--color-accent)",
                  transform: activeTag === t.tag ? "scale(1.05)" : "scale(1)",
                  boxShadow:
                    activeTag === t.tag ? "var(--shadow-sm)" : "none",
                }}
              >
                {t.tag}
                <span className="ml-1 opacity-60">({t.count})</span>
              </button>
            ))}
          </div>
        )}

        {/* Diary list */}
        <div className="space-y-3">
          {diaries.map((d, i) => (
            <DiaryCard
              key={d.id}
              diary={d}
              index={i}
              isNew={newDiaryIds.has(d.id)}
            />
          ))}
        </div>

        {/* Loading skeleton */}
        {loading && diaries.length === 0 && (
          <div className="space-y-3">
            <SkeletonCard delay={0} />
            <SkeletonCard delay={80} />
            <SkeletonCard delay={160} />
          </div>
        )}

        {/* Loading more indicator */}
        {loading && diaries.length > 0 && (
          <div
            className="py-8 text-center"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            <span
              className="inline-block h-5 w-5 rounded-full border-2 border-current border-t-transparent"
              style={{ animation: "spin 0.8s linear infinite" }}
            />
          </div>
        )}

        {/* Empty state */}
        {!loading && diaries.length === 0 && (
          <div className="py-20 text-center animate-fade-in">
            <div
              className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
              style={{ backgroundColor: "var(--color-accent-bg)" }}
            >
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--color-primary)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                <path d="m15 5 4 4" />
              </svg>
            </div>
            <p
              className="text-lg font-serif font-medium"
              style={{ color: "var(--color-text-secondary)" }}
            >
              还没有日记
            </p>
            <p
              className="mt-1 text-sm"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              点击上方开始记录你的第一篇
            </p>
          </div>
        )}

        {/* Load more */}
        {hasNext && !loading && (
          <div className="mt-8 text-center animate-fade-in">
            <button
              onClick={() => loadDiaries(page + 1, true)}
              className="btn-secondary"
            >
              加载更多
            </button>
          </div>
        )}
      </main>

      {/* CSS for spin animation */}
      <style jsx global>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
