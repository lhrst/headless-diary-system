"use client";

import { useRef, useState } from "react";
import MediaTextBadge from "./MediaTextBadge";

interface TimestampedLine {
  time: number; // seconds
  text: string;
}

interface VideoEmbedProps {
  mediaId: string;
  url: string;
  visualContent?: string;
  transcript?: string;
  textStatus?: "pending" | "processing" | "done" | "failed";
  textMethod?: string;
  onRetry?: () => void;
  onCopyText?: (text: string) => void;
}

/** Parse "[00:12] Some text" lines into structured data. */
function parseTimestampedText(raw: string): TimestampedLine[] {
  const lines = raw.split("\n").filter(Boolean);
  return lines.map((line) => {
    const match = line.match(/^\[(\d{1,2}):(\d{2})\]\s*(.*)/);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      return { time: minutes * 60 + seconds, text: match[3] };
    }
    return { time: -1, text: line };
  });
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function VideoEmbed({
  url,
  visualContent,
  transcript,
  textStatus,
  textMethod,
  onRetry,
  onCopyText,
}: VideoEmbedProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [copiedSection, setCopiedSection] = useState<"visual" | "transcript" | null>(null);

  function seekTo(time: number) {
    if (videoRef.current && time >= 0) {
      videoRef.current.currentTime = time;
      videoRef.current.play();
    }
  }

  function handleCopy(text: string, section: "visual" | "transcript") {
    onCopyText?.(text);
    navigator.clipboard.writeText(text).then(() => {
      setCopiedSection(section);
      setTimeout(() => setCopiedSection(null), 2000);
    });
  }

  const visualLines = visualContent ? parseTimestampedText(visualContent) : [];
  const transcriptLines = transcript ? parseTimestampedText(transcript) : [];

  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden bg-white dark:bg-neutral-900">
      {/* Video player */}
      <div className="bg-black">
        <video
          ref={videoRef}
          src={url}
          controls
          className="w-full max-h-80"
          preload="metadata"
        />
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

      {/* Content sections */}
      {(visualContent || transcript) && (
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-neutral-100 dark:divide-neutral-800 border-t border-neutral-100 dark:border-neutral-800">
          {/* Visual content */}
          {visualContent && (
            <div className="px-3 py-2">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-neutral-400">
                  画面内容
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(visualContent, "visual")}
                  className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
                >
                  {copiedSection === "visual" ? "已复制" : "复制"}
                </button>
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {visualLines.map((line, i) => (
                  <div key={i} className="flex gap-2 text-sm">
                    {line.time >= 0 && (
                      <button
                        type="button"
                        onClick={() => seekTo(line.time)}
                        className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 font-mono text-xs shrink-0 mt-0.5"
                      >
                        {formatTime(line.time)}
                      </button>
                    )}
                    <span className="text-neutral-600 dark:text-neutral-400">
                      {line.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Audio transcript */}
          {transcript && (
            <div className="px-3 py-2">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-neutral-400">
                  语音转录
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(transcript, "transcript")}
                  className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
                >
                  {copiedSection === "transcript" ? "已复制" : "复制"}
                </button>
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {transcriptLines.map((line, i) => (
                  <div key={i} className="flex gap-2 text-sm">
                    {line.time >= 0 && (
                      <button
                        type="button"
                        onClick={() => seekTo(line.time)}
                        className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 font-mono text-xs shrink-0 mt-0.5"
                      >
                        {formatTime(line.time)}
                      </button>
                    )}
                    <span className="text-neutral-600 dark:text-neutral-400">
                      {line.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
