"use client";

import { useEditor, EditorContent, Editor as TiptapEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Extension } from "@tiptap/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { suggestTags } from "@/lib/api";
import type { TagSuggestItem } from "@/lib/types";

/* ── Types ── */

interface EditorProps {
  initialContent?: string;
  onChange?: (content: string) => void;
  onSubmit?: () => void;
  onFileUpload?: (file: File) => void;
  placeholder?: string;
  className?: string;
}

/* ── Submit Shortcut Extension ── */

function createSubmitExtension(onSubmitRef: React.RefObject<(() => void) | undefined>) {
  return Extension.create({
    name: "submitShortcut",
    addKeyboardShortcuts() {
      return {
        "Mod-Enter": () => {
          onSubmitRef.current?.();
          return true;
        },
      };
    },
  });
}

/* ── Toolbar Button ── */

function ToolbarButton({
  active,
  disabled,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="transition-all disabled:opacity-30 disabled:cursor-not-allowed"
      style={{
        padding: "4px 8px",
        borderRadius: "var(--radius-sm)",
        fontSize: "13px",
        fontWeight: 500,
        color: active ? "var(--color-primary)" : "var(--color-text-tertiary)",
        backgroundColor: active ? "var(--color-accent-bg)" : "transparent",
      }}
      onMouseEnter={(e) => {
        if (!active && !disabled) {
          e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
          e.currentTarget.style.color = "var(--color-text-secondary)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = "transparent";
          e.currentTarget.style.color = "var(--color-text-tertiary)";
        }
      }}
    >
      {children}
    </button>
  );
}

/* ── Toolbar Divider ── */

function Divider() {
  return (
    <div
      className="mx-1"
      style={{
        width: 1,
        height: 16,
        backgroundColor: "var(--color-border)",
      }}
    />
  );
}

/* ── Toolbar ── */

function Toolbar({
  editor,
  onFileUpload,
}: {
  editor: TiptapEditor | null;
  onFileUpload?: (file: File) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!editor) return null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onFileUpload) {
      onFileUpload(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div
      className="flex flex-wrap items-center gap-0.5 px-3 py-2 sticky top-0 z-10"
      style={{
        borderBottom: "1px solid var(--color-border)",
        backgroundColor: "var(--color-surface, #fff)",
        borderRadius: "var(--radius-lg) var(--radius-lg) 0 0",
      }}
    >
      <ToolbarButton
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="加粗 (⌘B)"
      >
        <span className="font-bold">B</span>
      </ToolbarButton>

      <ToolbarButton
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="斜体 (⌘I)"
      >
        <span className="italic">I</span>
      </ToolbarButton>

      <ToolbarButton
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        title="删除线"
      >
        <span className="line-through">S</span>
      </ToolbarButton>

      <ToolbarButton
        active={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
        title="行内代码"
      >
        <span className="font-mono text-xs">{"`"}</span>
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        active={editor.isActive("heading", { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        title="标题 1"
      >
        H1
      </ToolbarButton>

      <ToolbarButton
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        title="标题 2"
      >
        H2
      </ToolbarButton>

      <ToolbarButton
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        title="标题 3"
      >
        H3
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="无序列表"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="8" x2="21" y1="6" y2="6" /><line x1="8" x2="21" y1="12" y2="12" /><line x1="8" x2="21" y1="18" y2="18" />
          <circle cx="3" cy="6" r="1" fill="currentColor" /><circle cx="3" cy="12" r="1" fill="currentColor" /><circle cx="3" cy="18" r="1" fill="currentColor" />
        </svg>
      </ToolbarButton>

      <ToolbarButton
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title="有序列表"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="10" x2="21" y1="6" y2="6" /><line x1="10" x2="21" y1="12" y2="12" /><line x1="10" x2="21" y1="18" y2="18" />
          <path d="M4 6h1v4" /><path d="M4 10h2" /><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
        </svg>
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        title="引用块"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z" />
          <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z" />
        </svg>
      </ToolbarButton>

      <ToolbarButton
        active={editor.isActive("codeBlock")}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        title="代码块"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
        </svg>
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="分隔线"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="2" y1="12" x2="22" y2="12" />
        </svg>
      </ToolbarButton>

      <Divider />

      {onFileUpload && (
        <>
          <ToolbarButton
            onClick={() => fileInputRef.current?.click()}
            title="上传图片/文件"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </ToolbarButton>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf,.doc,.docx,.txt,.md"
            className="hidden"
            onChange={handleFileSelect}
          />
          <Divider />
        </>
      )}

      <ToolbarButton
        disabled={!editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
        title="撤销 (⌘Z)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
        </svg>
      </ToolbarButton>

      <ToolbarButton
        disabled={!editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
        title="重做 (⌘⇧Z)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 7v6h-6" /><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
        </svg>
      </ToolbarButton>
    </div>
  );
}

/* ── Word Count & Footer ── */

function Footer({
  editor,
  showSubmitHint,
}: {
  editor: TiptapEditor | null;
  showSubmitHint: boolean;
}) {
  if (!editor) return null;

  const text = editor.state.doc.textContent;
  const cjkCount = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) || []).length;
  const nonCjkText = text.replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g, " ");
  const wordCount = nonCjkText.split(/\s+/).filter(Boolean).length;
  const total = cjkCount + wordCount;

  return (
    <div
      className="flex items-center justify-between px-4 py-2"
      style={{
        borderTop: "1px solid var(--color-border)",
        color: "var(--color-text-tertiary)",
        fontSize: "12px",
      }}
    >
      <span>{total} 字</span>
      {showSubmitHint && (
        <span className="select-none" style={{ opacity: 0.6 }}>
          <kbd
            className="mx-0.5 inline-flex h-5 items-center rounded px-1"
            style={{
              backgroundColor: "var(--color-bg-secondary)",
              border: "1px solid var(--color-border)",
              fontSize: "10px",
            }}
          >
            ⌘
          </kbd>
          <kbd
            className="mx-0.5 inline-flex h-5 items-center rounded px-1"
            style={{
              backgroundColor: "var(--color-bg-secondary)",
              border: "1px solid var(--color-border)",
              fontSize: "10px",
            }}
          >
            Enter
          </kbd>
          <span className="ml-1">发布</span>
        </span>
      )}
    </div>
  );
}

/* ── Markdown helpers ── */

export function htmlToMarkdown(html: string): string {
  let md = html;
  md = md.replace(/<s>(.*?)<\/s>/gi, "~~$1~~");
  md = md.replace(/<del>(.*?)<\/del>/gi, "~~$1~~");
  md = md.replace(/<hr\s*\/?>/gi, "\n---\n");
  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n\n");
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n\n");
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n\n");
  md = md.replace(/<strong>(.*?)<\/strong>/gi, "**$1**");
  md = md.replace(/<b>(.*?)<\/b>/gi, "**$1**");
  md = md.replace(/<em>(.*?)<\/em>/gi, "*$1*");
  md = md.replace(/<i>(.*?)<\/i>/gi, "*$1*");
  md = md.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, "> $1\n\n");
  md = md.replace(/<pre><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, "```\n$1\n```\n\n");
  md = md.replace(/<code>(.*?)<\/code>/gi, "`$1`");
  md = md.replace(/<li>(.*?)<\/li>/gi, "- $1\n");
  md = md.replace(/<\/?(ul|ol|p|br\s*\/?|div)[^>]*>/gi, "\n");
  md = md.replace(/<[^>]+>/g, "");
  md = md.replace(/\n{3,}/g, "\n\n").trim();
  return md;
}

export function markdownToHtml(md: string): string {
  let html = md;
  html = html.replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>");
  html = html.replace(/^---$/gm, "<hr>");
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");
  html = html.replace(/~~(.+?)~~/g, "<s>$1</s>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>");
  html = html.replace(/`(.+?)`/g, "<code>$1</code>");
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
  html = html
    .split("\n\n")
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      if (/^<(h[1-3]|blockquote|pre|ul|ol|li|hr)/.test(trimmed)) return trimmed;
      return `<p>${trimmed.replace(/\n/g, "<br>")}</p>`;
    })
    .join("");
  return html;
}

/* ── Editor Component ── */

export default function Editor({
  initialContent,
  onChange,
  onSubmit,
  onFileUpload,
  placeholder,
  className,
}: EditorProps) {
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;

  const [tagQuery, setTagQuery] = useState("");
  const [tagSuggestions, setTagSuggestions] = useState<TagSuggestItem[]>([]);
  const [showTagPopup, setShowTagPopup] = useState(false);
  const tagDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hashRangeRef = useRef<{ from: number; to: number } | null>(null);

  useEffect(() => {
    if (!showTagPopup || !tagQuery) {
      setTagSuggestions([]);
      return;
    }
    if (tagDebounceRef.current) clearTimeout(tagDebounceRef.current);
    tagDebounceRef.current = setTimeout(async () => {
      try {
        const res = await suggestTags(tagQuery);
        setTagSuggestions(res.suggestions.slice(0, 6));
      } catch {
        setTagSuggestions([]);
      }
    }, 200);
    return () => {
      if (tagDebounceRef.current) clearTimeout(tagDebounceRef.current);
    };
  }, [tagQuery, showTagPopup]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({
        placeholder: placeholder ?? "开始写日记...",
      }),
      createSubmitExtension(onSubmitRef as React.RefObject<(() => void) | undefined>),
    ],
    content: initialContent || "",
    editorProps: {
      attributes: {
        class:
          "prose prose-neutral max-w-none px-5 py-4 min-h-[200px] focus:outline-none",
      },
      handleKeyDown: (_view, event) => {
        if (event.key === "Escape" && showTagPopup) {
          setShowTagPopup(false);
          return true;
        }
        return false;
      },
      handleDrop: (_view, event) => {
        if (!onFileUpload) return false;
        const files = event.dataTransfer?.files;
        if (files && files.length > 0) {
          event.preventDefault();
          for (let i = 0; i < files.length; i++) {
            onFileUpload(files[i]);
          }
          return true;
        }
        return false;
      },
      handlePaste: (_view, event) => {
        if (!onFileUpload) return false;
        const files = event.clipboardData?.files;
        if (files && files.length > 0) {
          for (let i = 0; i < files.length; i++) {
            onFileUpload(files[i]);
          }
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      onChange?.(ed.getHTML());

      const cursorPos = ed.state.selection.from;
      const textBeforeCursor = ed.state.doc.textBetween(0, cursorPos);
      const hashMatch = textBeforeCursor.match(/#([\w\u4e00-\u9fff]*)$/);
      if (hashMatch) {
        setTagQuery(hashMatch[1]);
        setShowTagPopup(true);
        const from = cursorPos - hashMatch[0].length;
        hashRangeRef.current = { from, to: cursorPos };
      } else {
        setShowTagPopup(false);
      }
    },
  });

  const handleSelectTag = useCallback(
    (tag: string) => {
      if (!editor || !hashRangeRef.current) return;
      const { from, to } = hashRangeRef.current;
      editor
        .chain()
        .focus()
        .deleteRange({ from, to })
        .insertContentAt(from, `#${tag} `)
        .run();
      setShowTagPopup(false);
    },
    [editor],
  );

  const setContent = useCallback(
    (content: string) => {
      if (editor && content !== editor.getHTML()) {
        editor.commands.setContent(content);
      }
    },
    [editor],
  );

  useEffect(() => {
    if (initialContent !== undefined) {
      setContent(initialContent);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialContent]);

  return (
    <div
      className={`relative overflow-visible transition-all ${className ?? ""}`}
      style={{
        border: "1.5px solid var(--color-border)",
        borderRadius: "var(--radius-lg)",
        backgroundColor: "var(--color-surface, #fff)",
      }}
      onFocus={(e) => {
        const el = e.currentTarget;
        el.style.borderColor = "var(--color-primary)";
        el.style.boxShadow = "var(--shadow-glow)";
      }}
      onBlur={(e) => {
        const el = e.currentTarget;
        if (!el.contains(e.relatedTarget as Node)) {
          el.style.borderColor = "var(--color-border)";
          el.style.boxShadow = "none";
        }
      }}
    >
      <Toolbar editor={editor} onFileUpload={onFileUpload} />
      <EditorContent editor={editor} />
      <Footer editor={editor} showSubmitHint={!!onSubmit} />

      {/* Tag autocomplete popup */}
      {showTagPopup && tagSuggestions.length > 0 && (
        <div
          className="absolute left-4 right-4 z-50 mt-1 max-h-56 overflow-y-auto animate-scale-in"
          style={{
            bottom: "3rem",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--color-border)",
            backgroundColor: "var(--color-surface, #fff)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          {tagSuggestions.map((s) => (
            <button
              key={s.tag}
              type="button"
              className="flex w-full items-center justify-between px-4 py-2.5 text-sm transition-colors"
              style={{ color: "var(--color-text)" }}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelectTag(s.tag);
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <span>#{s.tag}</span>
              <span
                className="text-xs"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                {s.count} 次
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export { markdownToHtml as importMarkdown, htmlToMarkdown as exportMarkdown };
