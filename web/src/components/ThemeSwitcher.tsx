"use client";

import { useState, useEffect } from "react";

const themes = [
  { id: "default", name: "默认", desc: "简洁现代" },
  { id: "journal", name: "日记本", desc: "温暖纸质风" },
];

export default function ThemeSwitcher() {
  const [current, setCurrent] = useState("default");

  useEffect(() => {
    setCurrent(localStorage.getItem("diary_theme") || "default");
  }, []);

  const switchTheme = (id: string) => {
    document.documentElement.setAttribute("data-theme", id);
    localStorage.setItem("diary_theme", id);
    setCurrent(id);
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold"
        style={{ color: "var(--color-text-secondary)" }}>
        主题
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {themes.map((t) => (
          <button
            key={t.id}
            onClick={() => switchTheme(t.id)}
            className="rounded-xl border p-4 text-left transition-all"
            style={{
              borderColor: current === t.id
                ? "var(--color-primary)"
                : "var(--color-border)",
              backgroundColor: current === t.id
                ? "var(--color-accent-bg)"
                : "var(--color-bg)",
            }}
          >
            <div className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
              {t.name}
            </div>
            <div className="text-xs mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
              {t.desc}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
