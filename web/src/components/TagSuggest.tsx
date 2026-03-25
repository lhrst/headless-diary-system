"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { suggestTags } from "@/lib/api";
import type { TagSuggestItem } from "@/lib/types";

interface TagSuggestProps {
  query: string;
  visible: boolean;
  /** Anchor position (x, y) in pixels relative to the viewport. */
  position: { top: number; left: number };
  onSelect: (tag: string) => void;
  onCreate: (tag: string) => void;
  onClose: () => void;
}

export default function TagSuggest({
  query,
  visible,
  position,
  onSelect,
  onCreate,
  onClose,
}: TagSuggestProps) {
  const [suggestions, setSuggestions] = useState<TagSuggestItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  /* ── Debounced fetch ── */
  const fetchSuggestions = useCallback(
    (q: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        if (!q.trim()) {
          setSuggestions([]);
          return;
        }
        setLoading(true);
        try {
          const res = await suggestTags(q);
          setSuggestions(res.suggestions.slice(0, 6));
        } catch {
          setSuggestions([]);
        } finally {
          setLoading(false);
        }
      }, 150);
    },
    [],
  );

  useEffect(() => {
    if (visible) {
      fetchSuggestions(query);
      setActiveIndex(0);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, visible, fetchSuggestions]);

  /* ── Keyboard navigation ── */
  useEffect(() => {
    if (!visible) return;

    const totalItems = suggestions.length + 1; // +1 for "create new"

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % totalItems);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) => (prev - 1 + totalItems) % totalItems);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (activeIndex < suggestions.length) {
          onSelect(suggestions[activeIndex].tag);
        } else {
          onCreate(query);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [visible, suggestions, activeIndex, query, onSelect, onCreate, onClose]);

  if (!visible) return null;

  const totalItems = suggestions.length + 1;

  return (
    <div
      ref={containerRef}
      className="fixed z-50 w-64 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg overflow-hidden"
      style={{ top: position.top, left: position.left }}
    >
      {loading && (
        <div className="px-3 py-2 text-xs text-neutral-400">搜索中...</div>
      )}

      {!loading && suggestions.length === 0 && query.trim() && (
        <div className="px-3 py-2 text-xs text-neutral-400">无匹配标签</div>
      )}

      <ul className="py-1">
        {suggestions.map((tag, idx) => (
          <li
            key={tag.tag}
            className={`flex items-center justify-between px-3 py-1.5 cursor-pointer text-sm ${
              idx === activeIndex
                ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                : "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700/50"
            }`}
            onMouseEnter={() => setActiveIndex(idx)}
            onClick={() => onSelect(tag.tag)}
          >
            <span className="truncate">#{tag.tag}</span>
            <span className="ml-2 text-xs text-neutral-400 shrink-0">
              {tag.count} 次
            </span>
          </li>
        ))}

        {/* Create new tag */}
        <li
          className={`flex items-center px-3 py-1.5 cursor-pointer text-sm border-t border-neutral-100 dark:border-neutral-700 ${
            activeIndex === totalItems - 1
              ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
              : "text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-700/50"
          }`}
          onMouseEnter={() => setActiveIndex(totalItems - 1)}
          onClick={() => onCreate(query)}
        >
          <span className="mr-1.5 text-base leading-none">+</span>
          <span className="truncate">
            创建新标签 <span className="font-medium">#{query}</span>
          </span>
        </li>
      </ul>
    </div>
  );
}
