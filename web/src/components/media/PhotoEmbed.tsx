"use client";

import { useState } from "react";
import MediaTextBadge from "./MediaTextBadge";

interface PhotoEmbedProps {
  mediaId: string;
  url: string;
  caption?: string;
  ocrText?: string;
  tags?: string[];
  textStatus?: "pending" | "processing" | "done" | "failed";
  textMethod?: string;
  onRegenerate?: () => void;
  onRetry?: () => void;
  onTagClick?: (tag: string) => void;
}

export default function PhotoEmbed({
  url,
  caption,
  ocrText,
  tags,
  textStatus,
  textMethod,
  onRegenerate,
  onRetry,
  onTagClick,
}: PhotoEmbedProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden bg-white dark:bg-neutral-900">
      {/* Image */}
      <div
        className="relative cursor-zoom-in group"
        onClick={() => setLightboxOpen(true)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={caption || "照片"}
          className="w-full object-contain max-h-96 bg-neutral-100 dark:bg-neutral-800"
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors" />
      </div>

      {/* Caption */}
      {caption && (
        <div className="px-3 py-2 text-sm text-neutral-600 dark:text-neutral-400 border-t border-neutral-100 dark:border-neutral-800">
          {caption}
        </div>
      )}

      {/* Status badge */}
      {textStatus && (
        <div className="px-3 py-1.5 border-t border-neutral-100 dark:border-neutral-800">
          <MediaTextBadge
            status={textStatus}
            method={textMethod}
            onRetry={onRetry}
          />
        </div>
      )}

      {/* OCR text */}
      {ocrText && (
        <div className="px-3 py-2 border-t border-neutral-100 dark:border-neutral-800">
          <div className="text-xs font-medium text-neutral-400 mb-1">OCR 文本</div>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 whitespace-pre-wrap">
            {ocrText}
          </p>
        </div>
      )}

      {/* Tags */}
      {tags && tags.length > 0 && (
        <div className="px-3 py-2 border-t border-neutral-100 dark:border-neutral-800 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => onTagClick?.(tag)}
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
            >
              #{tag}
            </button>
          ))}
        </div>
      )}

      {/* Regenerate button */}
      {textStatus === "done" && onRegenerate && (
        <div className="px-3 py-2 border-t border-neutral-100 dark:border-neutral-800">
          <button
            type="button"
            onClick={onRegenerate}
            className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
          >
            重新生成
          </button>
        </div>
      )}

      {/* Lightbox */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 text-white/70 hover:text-white text-2xl leading-none"
            onClick={() => setLightboxOpen(false)}
          >
            &times;
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={caption || "照片"}
            className="max-w-[90vw] max-h-[90vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
