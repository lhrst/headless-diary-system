"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import { createDiary } from "@/lib/api";
import Navbar from "@/components/Navbar";
import Editor, { htmlToMarkdown } from "@/components/Editor";

export default function NewDiaryPage() {
  const { mounted } = useAuth();
  const router = useRouter();
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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

  const handleSave = async () => {
    if (!content.trim()) return;
    setSaving(true);
    setError("");
    try {
      await createDiary(content, title || undefined);
      router.push("/");
    } catch {
      setError("保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-8 animate-fade-in">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
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
              新建日记
            </h1>
          </div>
          <div className="flex gap-2">
            <button onClick={() => router.back()} className="btn-secondary text-sm">
              取消
            </button>
            <button
              onClick={handleSave}
              className="btn-primary text-sm"
              disabled={saving || !content.trim()}
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <span
                    className="inline-block h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white"
                    style={{ animation: "spin 0.6s linear infinite" }}
                  />
                  发布中...
                </span>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5">
                    <path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" />
                  </svg>
                  发布
                </>
              )}
            </button>
          </div>
        </div>

        {error && (
          <div
            className="mb-4 p-3 text-sm animate-slide-in-down"
            style={{
              color: "var(--color-danger)",
              backgroundColor: "rgba(196, 82, 58, 0.06)",
              borderRadius: "var(--radius-md)",
              border: "1px solid rgba(196, 82, 58, 0.15)",
            }}
          >
            {error}
          </div>
        )}

        <input
          type="text"
          className="input mb-4"
          placeholder="标题（可选，AI 会自动生成）"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{
            fontFamily: "'Lora', 'Noto Serif SC', serif",
            fontSize: "18px",
            fontWeight: 600,
          }}
        />

        <Editor
          placeholder="开始记录今天的想法..."
          onChange={(html) => setContent(htmlToMarkdown(html))}
          onSubmit={handleSave}
          enableUpload
          className="min-h-[60vh]"
        />
      </main>

      <style jsx global>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
