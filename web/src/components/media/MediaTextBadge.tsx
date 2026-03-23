"use client";

interface MediaTextBadgeProps {
  status: "pending" | "processing" | "done" | "failed";
  method?: string;
  onRetry?: () => void;
}

export default function MediaTextBadge({
  status,
  method,
  onRetry,
}: MediaTextBadgeProps) {
  switch (status) {
    case "pending":
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          等待处理...
        </span>
      );

    case "processing":
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400">
          <svg
            className="w-3 h-3 animate-spin"
            viewBox="0 0 16 16"
            fill="none"
          >
            <circle
              cx="8"
              cy="8"
              r="6"
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray="28"
              strokeDashoffset="8"
              strokeLinecap="round"
            />
          </svg>
          正在生成...
        </span>
      );

    case "done":
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          {method || "已完成"}
        </span>
      );

    case "failed":
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
          生成失败
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="ml-1 underline underline-offset-2 hover:text-red-700 dark:hover:text-red-300 transition-colors"
            >
              重试
            </button>
          )}
        </span>
      );

    default:
      return null;
  }
}
