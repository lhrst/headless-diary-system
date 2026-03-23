"use client";

import PhotoEmbed from "./PhotoEmbed";
import AudioEmbed from "./AudioEmbed";
import VideoEmbed from "./VideoEmbed";

interface MediaEmbedProps {
  mediaId: string;
  mediaType: "photo" | "audio" | "video";
  url: string;
  caption?: string;
  ocrText?: string;
  transcript?: string;
  visualContent?: string;
  tags?: string[];
  textStatus?: "pending" | "processing" | "done" | "failed";
  textMethod?: string;
  onRegenerate?: () => void;
  onRetry?: () => void;
  onTagClick?: (tag: string) => void;
  onCopyText?: (text: string) => void;
  onAddToContent?: (text: string) => void;
}

export default function MediaEmbed({
  mediaId,
  mediaType,
  url,
  caption,
  ocrText,
  transcript,
  visualContent,
  tags,
  textStatus,
  textMethod,
  onRegenerate,
  onRetry,
  onTagClick,
  onCopyText,
  onAddToContent,
}: MediaEmbedProps) {
  switch (mediaType) {
    case "photo":
      return (
        <PhotoEmbed
          mediaId={mediaId}
          url={url}
          caption={caption}
          ocrText={ocrText}
          tags={tags}
          textStatus={textStatus}
          textMethod={textMethod}
          onRegenerate={onRegenerate}
          onRetry={onRetry}
          onTagClick={onTagClick}
        />
      );
    case "audio":
      return (
        <AudioEmbed
          mediaId={mediaId}
          url={url}
          transcript={transcript}
          textStatus={textStatus}
          textMethod={textMethod}
          onRetry={onRetry}
          onCopyText={onCopyText}
          onAddToContent={onAddToContent}
        />
      );
    case "video":
      return (
        <VideoEmbed
          mediaId={mediaId}
          url={url}
          visualContent={visualContent}
          transcript={transcript}
          textStatus={textStatus}
          textMethod={textMethod}
          onRetry={onRetry}
          onCopyText={onCopyText}
        />
      );
    default:
      return (
        <div className="p-4 text-sm text-neutral-500 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700 rounded-lg">
          不支持的媒体类型: {mediaType}
        </div>
      );
  }
}
