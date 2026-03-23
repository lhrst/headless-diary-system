"use client";

import { useRef, useState } from "react";
import MediaTextBadge from "./MediaTextBadge";

interface AudioEmbedProps {
  mediaId: string;
  url: string;
  transcript?: string;
  textStatus?: "pending" | "processing" | "done" | "failed";
  textMethod?: string;
  onRetry?: () => void;
  onCopyText?: (text: string) => void;
  onAddToContent?: (text: string) => void;
}

const SPEED_OPTIONS = [0.5, 1, 1.5, 2] as const;

export default function AudioEmbed({
  url,
  transcript,
  textStatus,
  textMethod,
  onRetry,
  onCopyText,
  onAddToContent,
}: AudioEmbedProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [speed, setSpeed] = useState<number>(1);
  const [copied, setCopied] = useState(false);

  function handleSpeedChange(newSpeed: number) {
    setSpeed(newSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = newSpeed;
    }
  }

  function handleCopy() {
    if (!transcript) return;
    onCopyText?.(transcript);
    navigator.clipboard.writeText(transcript).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden bg-white dark:bg-neutral-900">
      {/* Audio player */}
      <div className="px-3 py-3">
        <audio
          ref={audioRef}
          src={url}
          controls
          className="w-full h-10"
          preload="metadata"
        />
      </div>

      {/* Speed control */}
      <div className="px-3 pb-2 flex items-center gap-1">
        <span className="text-xs text-neutral-400 mr-1">速度</span>
        {SPEED_OPTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => handleSpeedChange(s)}
            className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
              speed === s
                ? "bg-neutral-200 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-200"
                : "text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
            }`}
          >
            {s}x
          </button>
        ))}
      </div>

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

      {/* Transcript */}
      {transcript && (
        <div className="px-3 py-2 border-t border-neutral-100 dark:border-neutral-800">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-neutral-400">转录文本</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
              >
                {copied ? "已复制" : "复制"}
              </button>
              {onAddToContent && (
                <button
                  type="button"
                  onClick={() => onAddToContent(transcript)}
                  className="text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                >
                  添加到文本
                </button>
              )}
            </div>
          </div>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 whitespace-pre-wrap leading-relaxed">
            {transcript}
          </p>
        </div>
      )}
    </div>
  );
}
