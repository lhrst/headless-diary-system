"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import { getDiaries, getTags, createDiary } from "@/lib/api";
import type { DiaryBrief, TagSuggestItem } from "@/lib/types";
import DiaryCard from "@/components/DiaryCard";
import Navbar from "@/components/Navbar";
import dynamic from "next/dynamic";

const Editor = dynamic(() => import("@/components/Editor"), { ssr: false });

export default function HomePage() {
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
  const [publishing, setPublishing] = useState(false);
  const [userLat, setUserLat] = useState<number | undefined>();
  const [userLng, setUserLng] = useState<number | undefined>();

  // Request geolocation on mount
  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLat(pos.coords.latitude);
          setUserLng(pos.coords.longitude);
        },
        () => {
          // User denied or error — silently ignore
        },
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

  const handleQuickPublish = async () => {
    if (!quickContent.trim() || publishing) return;
    setPublishing(true);
    try {
      await createDiary(quickContent, quickTitle || undefined, userLat, userLng);
      setQuickContent("");
      setQuickTitle("");
      loadDiaries(1);
    } catch (err) {
      console.error(err);
    } finally {
      setPublishing(false);
    }
  };

  const handleTagClick = (tag: string) => {
    const next = activeTag === tag ? "" : tag;
    setActiveTag(next);
    setTimeout(() => loadDiaries(1), 0);
  };

  if (!mounted) {
    return <div className="py-20 text-center text-sm">加载中...</div>;
  }

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-8">
        {/* Quick publish */}
        {authed && (
          <div
            className="mb-6 rounded-xl border p-4"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-surface, var(--color-bg))",
            }}
          >
            <input
              type="text"
              className="input mb-2"
              placeholder="标题（可选，AI 会自动生成）"
              value={quickTitle}
              onChange={(e) => setQuickTitle(e.target.value)}
            />
            <Editor
              placeholder="记录一下..."
              onChange={(html) => setQuickContent(html)}
              onSubmit={handleQuickPublish}
              onFileUpload={async (file) => {
                try {
                  const { uploadMedia } = await import("@/lib/api");
                  const res = await uploadMedia(file);
                  setQuickContent((prev) => prev + `\n${res.markdown_embed}\n`);
                } catch (e) { console.error(e); }
              }}
            />
            <div
              className="mt-2 flex items-center justify-end gap-2"
            >
              <button
                onClick={handleQuickPublish}
                className="btn-primary"
                disabled={publishing || !quickContent.trim()}
              >
                {publishing ? "发布中..." : "发布"}
              </button>
            </div>
          </div>
        )}

        {/* Search */}
        <form onSubmit={handleSearch} className="mb-6">
          <input
            type="text"
            className="input"
            placeholder="搜索日记内容..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>

        {/* Tag filter */}
        {tags.length > 0 && (
          <div className="mb-6 flex flex-wrap gap-2">
            {tags.map((t) => (
              <button
                key={t.tag}
                onClick={() => handleTagClick(t.tag)}
                className="tag cursor-pointer"
                style={{
                  backgroundColor:
                    activeTag === t.tag
                      ? "var(--color-primary)"
                      : "var(--color-accent-bg)",
                  color:
                    activeTag === t.tag ? "#fff" : "var(--color-accent)",
                }}
              >
                {t.tag} ({t.count})
              </button>
            ))}
          </div>
        )}

        {/* Diary list */}
        <div className="space-y-3">
          {diaries.map((d) => (
            <DiaryCard key={d.id} diary={d} />
          ))}
        </div>

        {loading && (
          <div className="py-12 text-center text-sm"
            style={{ color: "var(--color-text-tertiary)" }}>
            加载中...
          </div>
        )}

        {!loading && diaries.length === 0 && (
          <div className="py-20 text-center">
            <p className="text-lg font-medium"
              style={{ color: "var(--color-text-secondary)" }}>
              还没有日记
            </p>
            <p className="mt-1 text-sm"
              style={{ color: "var(--color-text-tertiary)" }}>
              点击右上角「新建」开始记录
            </p>
          </div>
        )}

        {hasNext && !loading && (
          <div className="mt-6 text-center">
            <button
              onClick={() => loadDiaries(page + 1, true)}
              className="btn-secondary"
            >
              加载更多
            </button>
          </div>
        )}
      </main>
    </>
  );
}
