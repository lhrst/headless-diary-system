"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { getDiaries } from "@/lib/api";
import type { DiaryBrief } from "@/lib/types";
import DiaryCard from "@/components/DiaryCard";
import Navbar from "@/components/Navbar";

export default function TagFilterPage() {
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
        const res = await getDiaries({ page: p, page_size: 20, tag });
        setDiaries((prev) => (append ? [...prev, ...res.items] : res.items));
        setHasNext(res.has_next);
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
    if (!isAuthenticated()) {
      router.replace("/login");
      return;
    }
    load(1);
  }, [router, load]);

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 flex items-center gap-3">
          <button onClick={() => router.back()} className="btn-ghost">
            &larr;
          </button>
          <h1 className="text-xl font-bold" style={{ color: "var(--color-text)" }}>
            标签：
            <span className="tag ml-2 text-base">{tag}</span>
          </h1>
        </div>

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
          <p className="py-12 text-center text-sm"
            style={{ color: "var(--color-text-secondary)" }}>
            该标签下暂无日记
          </p>
        )}

        {hasNext && !loading && (
          <div className="mt-6 text-center">
            <button
              onClick={() => load(page + 1, true)}
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
