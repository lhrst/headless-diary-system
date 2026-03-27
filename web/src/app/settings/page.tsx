"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/useAuth";
import Navbar from "@/components/Navbar";

const themes = [
  {
    id: "default",
    name: "奶油白",
    desc: "温暖明亮",
    colors: ["#FAF7F4", "#B87351", "#2A2118"],
  },
  {
    id: "journal",
    name: "手帐棕",
    desc: "复古质感",
    colors: ["#F5F0EB", "#8B6E52", "#32281E"],
  },
];

export default function SettingsPage() {
  const { mounted } = useAuth();
  const [currentTheme, setCurrentTheme] = useState("default");

  useEffect(() => {
    setCurrentTheme(localStorage.getItem("diary_theme") || "default");
  }, []);

  const switchTheme = (themeId: string) => {
    setCurrentTheme(themeId);
    localStorage.setItem("diary_theme", themeId);
    document.documentElement.setAttribute("data-theme", themeId);
  };

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

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-8 animate-fade-in">
        <h1
          className="mb-8 font-serif text-2xl font-bold"
          style={{ color: "var(--color-text)" }}
        >
          设置
        </h1>

        <div className="space-y-8">
          {/* Theme Switcher */}
          <div>
            <h3
              className="mb-4 flex items-center gap-2 text-sm font-semibold"
              style={{ color: "var(--color-text-secondary)" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />
              </svg>
              外观主题
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {themes.map((theme) => {
                const isActive = currentTheme === theme.id;
                return (
                  <button
                    key={theme.id}
                    onClick={() => switchTheme(theme.id)}
                    className="p-4 text-left transition-all"
                    style={{
                      border: isActive
                        ? "2px solid var(--color-primary)"
                        : "1.5px solid var(--color-border)",
                      borderRadius: "var(--radius-lg)",
                      backgroundColor: "var(--color-surface, #fff)",
                      boxShadow: isActive ? "var(--shadow-glow)" : "var(--shadow-sm)",
                    }}
                  >
                    {/* Color preview */}
                    <div className="mb-3 flex gap-1.5">
                      {theme.colors.map((color, i) => (
                        <div
                          key={i}
                          className="h-6 flex-1 rounded-md"
                          style={{
                            backgroundColor: color,
                            border: "1px solid rgba(0,0,0,0.06)",
                          }}
                        />
                      ))}
                    </div>
                    <p
                      className="text-sm font-medium"
                      style={{ color: "var(--color-text)" }}
                    >
                      {theme.name}
                    </p>
                    <p
                      className="text-xs mt-0.5"
                      style={{ color: "var(--color-text-tertiary)" }}
                    >
                      {theme.desc}
                    </p>
                    {isActive && (
                      <div className="mt-2 flex items-center gap-1 text-xs" style={{ color: "var(--color-primary)" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                        当前使用
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* About */}
          <div
            className="p-5"
            style={{
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-lg)",
              backgroundColor: "var(--color-bg-secondary)",
            }}
          >
            <h3
              className="mb-2 text-sm font-semibold"
              style={{ color: "var(--color-text-secondary)" }}
            >
              关于
            </h3>
            <p className="text-sm" style={{ color: "var(--color-text-tertiary)" }}>
              革命启示录 v0.1.0
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--color-text-tertiary)", opacity: 0.6 }}>
              记录思想，启示未来
            </p>
          </div>
        </div>
      </main>
    </>
  );
}
