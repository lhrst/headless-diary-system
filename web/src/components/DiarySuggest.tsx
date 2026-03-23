"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { suggestDiary } from "@/lib/api";
import type { DiarySuggestItem } from "@/lib/types";

interface DiarySuggestProps {
  query: string;
  visible: boolean;
  position: { top: number; left: number };
  /** Called when a diary is selected — inserts [[id|title]]. */
  onSelect: (item: DiarySuggestItem) => void;
  onClose: () => void;
}

export default function DiarySuggest({
  query,
  visible,
  position,
  onSelect,
  onClose,
}: DiarySuggestProps) {
  const [suggestions, setSuggestions] = useState<DiarySuggestItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Debounced fetch ── */
  const fetchSuggestions = useCallback((q: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      if (!q.trim()) {
        setSuggestions([]);
        return;
      }
      setLoading(true);
      try {
        const res = await suggestDiary(q);
        setSuggestions(res.suggestions.slice(0, 6));
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 150);
  }, []);

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
    if (!visible || suggestions.length === 0) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % suggestions.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        onSelect(suggestions[activeIndex]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [visible, suggestions, activeIndex, onSelect, onClose]);

  if (!visible) return null;

  return (
    <div
      className="fixed z-50 w-80 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg overflow-hidden"
      style={{ top: position.top, left: position.left }}
    >
      {loading && (
        <div className="px-3 py-2 text-xs text-neutral-400">搜索中...</div>
      )}

      {!loading && suggestions.length === 0 && query.trim() && (
        <div className="px-3 py-2 text-xs text-neutral-400">未找到匹配的日记</div>
      )}

      <ul className="py-1 max-h-72 overflow-y-auto">
        {suggestions.map((item, idx) => (
          <li
            key={item.id}
            className={`px-3 py-2 cursor-pointer ${
              idx === activeIndex
                ? "bg-blue-50 dark:bg-blue-900/30"
                : "hover:bg-neutral-50 dark:hover:bg-neutral-700/50"
            }`}
            onMouseEnter={() => setActiveIndex(idx)}
            onClick={() => onSelect(item)}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span
                className={`text-sm font-medium truncate ${
                  idx === activeIndex
                    ? "text-blue-700 dark:text-blue-300"
                    : "text-neutral-800 dark:text-neutral-200"
                }`}
              >
                {item.title}
              </span>
            </div>
            {item.preview && (
              <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5 line-clamp-1">
                {item.preview}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
