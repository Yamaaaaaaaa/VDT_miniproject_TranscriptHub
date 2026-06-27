"use client";

import { useRef, useCallback, useState, useEffect, memo } from "react";
import { TranscriptSegment } from "@/types/transcript";
import { QuillEditor } from "./QuillEditor";

interface TranscriptSegmentItemProps {
  segment: TranscriptSegment;
  index: number;
  isActive?: boolean;
  mode: "view" | "edit";
  editedContent?: string;
  canEdit?: boolean;
  getYText?: (segmentId: string) => import("yjs").Text | undefined;
  getAwareness?: () => any;
  setFocus?: (segmentId: string | null, field: "speaker" | "content" | null) => void;
  collabUsers?: any[];
  currentUserId?: string | number | null;
  onContentChange?: (content: string) => void;
  onSpeakerChange?: (segmentId: string, speaker: string) => void;
  onSegmentClick?: (startTime: number) => void;
  formatDuration: (seconds: number) => string;
}

export const TranscriptSegmentItem = memo(function TranscriptSegmentItem({
  segment,
  index,
  isActive = false,
  mode,
  editedContent,
  canEdit = false,
  getYText,
  getAwareness,
  setFocus,
  collabUsers = [],
  currentUserId,
  onContentChange,
  onSpeakerChange,
  onSegmentClick,
  formatDuration,
}: TranscriptSegmentItemProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [localSpeaker, setLocalSpeaker] = useState(segment.speaker);
  const [isFocused, setIsFocused] = useState(false);

  const otherEditorsOnSpeaker = collabUsers.filter(
    (u) =>
      String(u.id) !== String(currentUserId) &&
      u.focus?.segmentId === segment.id &&
      u.focus?.field === "speaker"
  );

  useEffect(() => {
    if (!isFocused) {
      setLocalSpeaker(segment.speaker);
    }
  }, [segment.speaker, isFocused]);

  const handleContainerClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (mode === "view") {
        if (onSegmentClick) {
          onSegmentClick(segment.startTime);
        }
      } else if (
        mode === "edit" &&
        !target.closest(".quill-editor-wrapper") &&
        target.tagName !== "TEXTAREA" &&
        !target.closest("input")
      ) {
        if (onSegmentClick) {
          onSegmentClick(segment.startTime);
        }
      }
    },
    [mode, onSegmentClick, segment.startTime]
  );

  return (
    <div
      ref={outerRef}
      onClick={handleContainerClick}
      className={`group relative rounded-2xl border p-4 transition-all cursor-pointer select-none ${
        isActive
          ? "border-red-200 bg-red-50/30 shadow-sm shadow-red-100/50"
          : "border-slate-100 bg-white hover:border-red-100 hover:bg-red-50/10"
      }`}
    >
      <div className="flex items-start gap-4">
        {/* Segment number badge */}
        <div className="flex flex-col items-center gap-1 shrink-0">
          <span className="w-7 h-7 rounded-full bg-slate-100 text-slate-400 text-[10px] font-black flex items-center justify-center">
            {index + 1}
          </span>
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
              isActive
                ? "bg-red-500 text-white shadow-md shadow-red-500/30"
                : "bg-slate-50 text-slate-400"
            }`}
          >
            {isActive ? (
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
            ) : (
              <span className="w-1.5 h-1.5 bg-current rounded-full" />
            )}
          </div>
        </div>

        {/* Speaker & Time */}
        <div className="shrink-0 min-w-[140px]">
          {mode === "edit" && canEdit ? (
            <div className="relative group/speaker mb-2 inline-flex items-center gap-1.5 max-w-[130px] w-full">
              <span className="w-1.5 h-1.5 rounded-full bg-red-600 opacity-60 absolute left-2.5 z-10 pointer-events-none" />
              {otherEditorsOnSpeaker.map((editor) => (
                <div
                  key={editor.id}
                  className="absolute left-[20px] top-[5px] h-[14px] pointer-events-none z-20"
                >
                  <div className="relative h-full">
                    {/* Bút trỏ (Caret line) */}
                    <div
                      className="w-[1.5px] h-full absolute left-0 top-0"
                      style={{ backgroundColor: editor.color }}
                    />
                    {/* Lá cờ hiển thị tên (Flag label) */}
                    <div
                      className="absolute -top-[14px] left-0 px-1 py-0.5 rounded-r-[3px] text-[8px] font-bold text-white whitespace-nowrap leading-none"
                      style={{ backgroundColor: editor.color }}
                    >
                      {editor.name}
                    </div>
                  </div>
                </div>
              ))}
              <input
                type="text"
                value={localSpeaker}
                onClick={(e) => e.stopPropagation()}
                onFocus={() => {
                  setIsFocused(true);
                  setFocus?.(segment.id, "speaker");
                }}
                onBlur={() => {
                  setIsFocused(false);
                  setFocus?.(null, null);
                  const trimmed = localSpeaker.trim();
                  if (trimmed && trimmed !== segment.speaker) {
                    onSpeakerChange?.(segment.id, trimmed);
                  } else if (!trimmed) {
                    setLocalSpeaker(segment.speaker);
                  }
                }}
                onChange={(e) => {
                  setLocalSpeaker(e.target.value);
                  onSpeakerChange?.(segment.id, e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.currentTarget.blur();
                  } else if (e.key === "Escape") {
                    setLocalSpeaker(segment.speaker);
                    e.currentTarget.blur();
                  }
                }}
                className="pl-5 pr-2 py-1 rounded-xl text-[10px] font-black bg-red-50 text-red-600 border border-transparent hover:border-red-200 focus:border-red-400 focus:bg-white focus:outline-none transition-all w-full shadow-sm focus:shadow"
                style={
                  otherEditorsOnSpeaker.length > 0
                    ? {
                        borderColor: otherEditorsOnSpeaker[0].color,
                        boxShadow: `0 0 0 2px ${otherEditorsOnSpeaker[0].color}33`,
                        borderWidth: "1.5px",
                      }
                    : undefined
                }
                placeholder="Người nói..."
              />
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[10px] font-black mb-2 bg-red-50 text-red-600 max-w-[130px] w-full">
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60 shrink-0" />
              <span className="truncate">{segment.speaker}</span>
            </div>
          )}
          <div className="flex items-center gap-1 text-[10px] text-slate-400 font-bold">
            <span className="font-mono">{formatDuration(segment.startTime)}</span>
            <span>→</span>
            <span className="font-mono">{formatDuration(segment.endTime)}</span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {mode === "view" ? (
            <p
              className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap break-words cursor-pointer hover:text-red-600 transition-colors"
            >
              {segment.content}
            </p>
          ) : getYText ? (
            <QuillEditor
              segmentId={segment.id}
              getYText={getYText}
              getAwareness={getAwareness}
              canEdit={canEdit}
              initialContent={editedContent ?? segment.content}
              onContentChange={(content) => onContentChange?.(content)}
            />
          ) : (
            <textarea
              value={editedContent ?? segment.content}
              readOnly
              onClick={(e) => e.stopPropagation()}
              className="w-full text-xs text-slate-500 leading-relaxed whitespace-pre-wrap break-words bg-transparent border border-transparent p-2 resize-none outline-none transition-all cursor-default"
              rows={Math.max(2, Math.ceil((editedContent ?? segment.content).length / 80))}
            />
          )}
        </div>
      </div>

      {/* Active indicator line */}
      {isActive && (
        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-red-500 rounded-full" />
      )}
    </div>
  );
});
