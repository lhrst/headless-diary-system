"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { createDiary } from "@/lib/api";
import Navbar from "@/components/Navbar";

export default function NewDiaryPage() {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isAuthenticated()) router.replace("/login");
  }, [router]);

  const handleSave = async () => {
    if (!content.trim()) return;
    setSaving(true);
    setError("");
    try {
      const diary = await createDiary(content, title || undefined);
      router.push(`/diary/${diary.id}`);
    } catch {
      setError("保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-bold" style={{ color: "var(--color-text)" }}>
            新建日记
          </h1>
          <div className="flex gap-2">
            <button onClick={() => router.back()} className="btn-secondary">
              取消
            </button>
            <button
              onClick={handleSave}
              className="btn-primary"
              disabled={saving || !content.trim()}
            >
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        </div>

        {error && (
          <p className="mb-4 text-sm" style={{ color: "var(--color-danger, #ef4444)" }}>
            {error}
          </p>
        )}

        <input
          type="text"
          className="input mb-4 text-lg font-semibold"
          placeholder="标题（可选，AI 会自动生成）"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <textarea
          className="input min-h-[60vh] resize-none font-sans leading-relaxed"
          placeholder="开始记录今天的想法..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          autoFocus
        />
      </main>
    </>
  );
}
