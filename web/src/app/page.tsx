"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { getDiaries, getTags } from "@/lib/api";
import type { DiaryBrief, TagSuggestItem } from "@/lib/types";
import DiaryCard from "@/components/DiaryCard";
import Navbar from "@/components/Navbar";

export default function HomePage() {
  const router = useRouter();
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
    if (!isAuthenticated()) {
      router.replace("/login");
      return;
    }
    loadDiaries(1);
    getTags()
      .then((res) => setTags(res.tags))
      .catch(console.error);
  }, [router, loadDiaries]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadDiaries(1);
  };

  const handleTagClick = (tag: string) => {
    const next = activeTag === tag ? "" : tag;
    setActiveTag(next);
    setTimeout(() => loadDiaries(1), 0);
  };

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-8">
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
