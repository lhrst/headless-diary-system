"use client";

import { useState, useEffect } from "react";

const themes = [
  { id: "default", name: "奶油白", desc: "温暖明亮" },
  { id: "journal", name: "手帐棕", desc: "复古质感" },
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
    <div>
      <h3
        className="mb-3 text-sm font-semibold"
        style={{ color: "var(--color-text-secondary)" }}
      >
        外观主题
      </h3>
      <div className="flex gap-2">
        {themes.map((t) => {
          const isActive = current === t.id;
          return (
            <button
              key={t.id}
              onClick={() => switchTheme(t.id)}
              className="px-4 py-2.5 text-sm font-medium transition-all"
              style={{
                borderRadius: "var(--radius-md)",
                border: isActive
                  ? "2px solid var(--color-primary)"
                  : "1.5px solid var(--color-border)",
                backgroundColor: isActive
                  ? "var(--color-accent-bg)"
                  : "var(--color-surface, #fff)",
                color: isActive
                  ? "var(--color-primary)"
                  : "var(--color-text-secondary)",
                boxShadow: isActive ? "var(--shadow-glow)" : "none",
              }}
            >
              {t.name}
              <span className="ml-1 text-xs opacity-60">{t.desc}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
