"use client";

import "./globals.css";
import { useCallback, useEffect, useState } from "react";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [theme, setTheme] = useState("default");
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("diary_theme") || "default";
    setTheme(saved);
  }, []);

  // Global click handler: click any .prose img to open lightbox
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "IMG" && target.closest(".prose")) {
        const src = (target as HTMLImageElement).src;
        if (src) setLightboxSrc(src);
      }
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  const closeLightbox = useCallback(() => setLightboxSrc(null), []);

  return (
    <html lang="zh-CN" data-theme={theme}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
        <meta name="theme-color" content="#FAF7F4" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=Lora:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Noto+Sans+SC:wght@400;500;600;700&family=Noto+Serif+SC:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <title>Diary</title>
      </head>
      <body className="min-h-screen font-sans">
        {children}
        {lightboxSrc && (
          <div className="image-lightbox-overlay" onClick={closeLightbox}>
            <img src={lightboxSrc} alt="" onClick={(e) => e.stopPropagation()} />
          </div>
        )}
      </body>
    </html>
  );
}
