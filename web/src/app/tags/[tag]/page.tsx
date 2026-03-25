"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import { getDiaries } from "@/lib/api";
import type { DiaryBrief } from "@/lib/types";
import DiaryCard from "@/components/DiaryCard";
import Navbar from "@/components/Navbar";

export default function TagFilterPage() {
  const { mounted, authed } = useAuth();
  const params = useParams();
  const router = useRouter();
  const tag = decodeURIComponent(params.tag as string);

  const [diaries, setDiaries] = useState<DiaryBrief[]>([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (p: number, append = false) => {
      setLoading(true);
      try {
        const res = await getDiaries({ page: p, per_page: 20, tag });
        setDiaries((prev) => (append ? [...prev, ...res.items] : res.items));
        setHasNext(res.items.length >= 20 && res.total > p * 20);
        setPage(p);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    },
    [tag],
  );

  useEffect(() => {
    if (!authed) return;
    load(1);
  }, [authed, load]);

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
        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="btn-ghost"
            style={{ padding: "6px" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
            </svg>
          </button>
          <h1
            className="font-serif text-xl font-bold"
            style={{ color: "var(--color-text)" }}
          >
            标签：
            <span className="tag ml-2 text-base">{tag}</span>
          </h1>
        </div>

        <div className="space-y-3">
          {diaries.map((d, i) => (
            <DiaryCard key={d.id} diary={d} index={i} />
          ))}
        </div>

        {loading && diaries.length === 0 && (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="card animate-fade-in-up"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="skeleton h-5 w-3/5 mb-3" />
                <div className="skeleton h-4 w-full mb-1.5" />
                <div className="skeleton h-4 w-4/5" />
              </div>
            ))}
          </div>
        )}

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

        {!loading && diaries.length === 0 && (
          <div className="py-16 text-center">
            <p
              className="text-sm"
              style={{ color: "var(--color-text-secondary)" }}
            >
              该标签下暂无日记
            </p>
          </div>
        )}

        {hasNext && !loading && (
          <div className="mt-8 text-center">
            <button
              onClick={() => load(page + 1, true)}
              className="btn-secondary"
            >
              加载更多
            </button>
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
