"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { getTags } from "@/lib/api";
import type { TagSuggestItem } from "@/lib/types";
import Navbar from "@/components/Navbar";

export default function TagsPage() {
  const router = useRouter();
  const [tags, setTags] = useState<TagSuggestItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
      return;
    }
    getTags()
      .then((res) => setTags(res.tags))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [router]);

  // Find max count for sizing
  const maxCount = Math.max(...tags.map((t) => t.count), 1);

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-8 text-2xl font-bold" style={{ color: "var(--color-text)" }}>
          标签
        </h1>

        {loading && (
          <div className="py-12 text-center text-sm"
            style={{ color: "var(--color-text-tertiary)" }}>
            加载中...
          </div>
        )}

        {!loading && tags.length === 0 && (
          <p className="py-12 text-center text-sm"
            style={{ color: "var(--color-text-secondary)" }}>
            暂无标签
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          {tags.map((t) => {
            const ratio = t.count / maxCount;
            const size = 0.875 + ratio * 0.75; // 0.875rem to 1.625rem
            return (
              <button
                key={t.name}
                onClick={() => router.push(`/tags/${encodeURIComponent(t.name)}`)}
                className="rounded-lg px-3 py-1.5 font-medium transition-colors"
                style={{
                  fontSize: `${size}rem`,
                  backgroundColor: "var(--color-accent-bg)",
                  color: "var(--color-accent)",
                }}
              >
                {t.name}
                <span className="ml-1 text-xs opacity-60">{t.count}</span>
              </button>
            );
          })}
        </div>
      </main>
    </>
  );
}
