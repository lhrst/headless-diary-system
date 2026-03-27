"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import { getDiary, updateDiary } from "@/lib/api";
import Navbar from "@/components/Navbar";
import Editor, { htmlToMarkdown, markdownToHtml } from "@/components/Editor";

export default function EditDiaryPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { mounted, authed } = useAuth();

  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authed) return;
    getDiary(id)
      .then((d) => {
        setContent(d.content);
        setTitle(d.title || "");
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id, authed]);

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
      await updateDiary(id, content, title || undefined);
      router.push(`/diary/${id}`);
    } catch {
      setError("保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <>
        <Navbar />
        <main className="mx-auto max-w-3xl px-4 py-8">
          <div className="skeleton h-8 w-40 mb-6" />
          <div className="skeleton h-12 w-full mb-4" />
          <div className="skeleton h-64 w-full" style={{ borderRadius: "var(--radius-lg)" }} />
        </main>
      </>
    );
  }

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
              编辑日记
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
                  保存中...
                </span>
              ) : (
                "保存"
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
          placeholder="标题（可选）"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{
            fontFamily: "'Lora', 'Noto Serif SC', serif",
            fontSize: "18px",
            fontWeight: 600,
          }}
        />

        <Editor
          initialContent={markdownToHtml(content)}
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
