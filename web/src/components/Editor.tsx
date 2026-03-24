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
      className={`px-2 py-1 rounded text-sm font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
        active
          ? "bg-neutral-200 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100"
          : "text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
      }`}
    >
      {children}
    </button>
  );
}

/* ── Toolbar Divider ── */

function Divider() {
  return <div className="w-px h-5 bg-neutral-200 dark:bg-neutral-700 mx-1" />;
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
    // Reset so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-neutral-200 dark:border-neutral-700 px-2 py-1 sticky top-0 bg-white dark:bg-neutral-900 z-10">
      {/* ── Text Format ── */}
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

      {/* ── Headings ── */}
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

      {/* ── Lists ── */}
      <ToolbarButton
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="无序列表"
      >
        <span className="text-base leading-none">•≡</span>
      </ToolbarButton>

      <ToolbarButton
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title="有序列表"
      >
        <span className="text-xs leading-none">1.</span>
      </ToolbarButton>

      <ToolbarButton
        onClick={() => {
          // Insert a task-list-like checkbox line using text
          editor.chain().focus().insertContent("- [ ] ").run();
        }}
        title="任务列表"
      >
        <span className="text-xs leading-none">☑</span>
      </ToolbarButton>

      <Divider />

      {/* ── Block ── */}
      <ToolbarButton
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        title="引用块"
      >
        <span className="text-base leading-none">&ldquo;</span>
      </ToolbarButton>

      <ToolbarButton
        active={editor.isActive("codeBlock")}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        title="代码块"
      >
        {"</>"}
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="分隔线"
      >
        ―
      </ToolbarButton>

      <Divider />

      {/* ── Insert / Upload ── */}
      {onFileUpload && (
        <>
          <ToolbarButton
            onClick={() => fileInputRef.current?.click()}
            title="上传图片/文件"
          >
            <span className="text-sm">📎</span>
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

      {/* ── Undo / Redo ── */}
      <ToolbarButton
        disabled={!editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
        title="撤销 (⌘Z)"
      >
        ↩
      </ToolbarButton>

      <ToolbarButton
        disabled={!editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
        title="重做 (⌘⇧Z)"
      >
        ↪
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
  // Count CJK characters individually, split latin words by spaces
  const cjkCount = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) || []).length;
  const nonCjkText = text.replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g, " ");
  const wordCount = nonCjkText.split(/\s+/).filter(Boolean).length;
  const total = cjkCount + wordCount;

  return (
    <div className="flex items-center justify-between text-xs text-neutral-400 dark:text-neutral-500 px-3 py-1.5 border-t border-neutral-200 dark:border-neutral-700">
      <span>{total} 字</span>
      {showSubmitHint && (
        <span className="select-none">⌘Enter 发布</span>
      )}
    </div>
  );
}

/* ── Markdown helpers ── */

/** Convert HTML to a simple markdown string (basic conversion). */
export function htmlToMarkdown(html: string): string {
  let md = html;
  // Strikethrough
  md = md.replace(/<s>(.*?)<\/s>/gi, "~~$1~~");
  md = md.replace(/<del>(.*?)<\/del>/gi, "~~$1~~");
  // Horizontal rule
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

/** Convert basic markdown to HTML for TipTap import. */
export function markdownToHtml(md: string): string {
  let html = md;
  // Code blocks first
  html = html.replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>");
  // Horizontal rule
  html = html.replace(/^---$/gm, "<hr>");
  // Headings
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");
  // Strikethrough
  html = html.replace(/~~(.+?)~~/g, "<s>$1</s>");
  // Bold & italic
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // Blockquote
  html = html.replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>");
  // Inline code
  html = html.replace(/`(.+?)`/g, "<code>$1</code>");
  // List items
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
  // Paragraphs — wrap remaining lines
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
  // Use ref so the extension always calls the latest onSubmit without re-creating
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;

  // Tag autocomplete state
  const [tagQuery, setTagQuery] = useState("");
  const [tagSuggestions, setTagSuggestions] = useState<TagSuggestItem[]>([]);
  const [showTagPopup, setShowTagPopup] = useState(false);
  const tagDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hashRangeRef = useRef<{ from: number; to: number } | null>(null);

  // Fetch tag suggestions with debounce
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
          "prose prose-neutral dark:prose-invert max-w-none px-4 py-3 min-h-[200px] focus:outline-none",
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

      // Tag autocomplete detection
      const cursorPos = ed.state.selection.from;
      const textBeforeCursor = ed.state.doc.textBetween(0, cursorPos);
      const hashMatch = textBeforeCursor.match(/#([\w\u4e00-\u9fff]*)$/);
      if (hashMatch) {
        setTagQuery(hashMatch[1]);
        setShowTagPopup(true);
        // Store the range of #query for replacement
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

  // Update content if initialContent changes externally
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
    // Only run when initialContent changes, not on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialContent]);

  return (
    <div
      className={`relative border border-neutral-200 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-900 overflow-visible ${className ?? ""}`}
    >
      <Toolbar editor={editor} onFileUpload={onFileUpload} />
      <EditorContent editor={editor} />
      <Footer editor={editor} showSubmitHint={!!onSubmit} />

      {/* Tag autocomplete popup */}
      {showTagPopup && tagSuggestions.length > 0 && (
        <div
          className="absolute left-4 right-4 z-50 mt-1 max-h-56 overflow-y-auto rounded-lg border bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-800"
          style={{ bottom: "3rem" }}
        >
          {tagSuggestions.map((s) => (
            <button
              key={s.tag}
              type="button"
              className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
              onMouseDown={(e) => {
                e.preventDefault(); // prevent editor blur
                handleSelectTag(s.tag);
              }}
            >
              <span style={{ color: "var(--color-text)" }}>#{s.tag}</span>
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

/** Export the markdown helpers together with the component for convenience. */
export { markdownToHtml as importMarkdown, htmlToMarkdown as exportMarkdown };
