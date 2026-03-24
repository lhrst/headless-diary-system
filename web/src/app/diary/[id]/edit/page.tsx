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
        setTitle(d.manual_title || d.title || "");
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id, authed]);

  if (!mounted) {
    return <div className="py-20 text-center text-sm">加载中...</div>;
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
        <div className="py-20 text-center text-sm"
          style={{ color: "var(--color-text-tertiary)" }}>
          加载中...
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-bold" style={{ color: "var(--color-text)" }}>
            编辑日记
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
          placeholder="标题（可选）"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <Editor
          initialContent={markdownToHtml(content)}
          onChange={(html) => setContent(htmlToMarkdown(html))}
          onSubmit={handleSave}
          className="min-h-[60vh]"
        />
      </main>
    </>
  );
}
