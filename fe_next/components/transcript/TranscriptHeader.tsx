"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  FileDown,
  FileText,
  Braces,
} from "lucide-react";
import { TranscriptDetail, AudioFileMetadata } from "@/types/transcript";

interface TranscriptHeaderProps {
  transcript: TranscriptDetail | null;
  audioFile: AudioFileMetadata | null;
  formatDuration: (seconds: number) => string;
  mode: "view" | "edit";
}

export function TranscriptHeader({
  transcript,
  audioFile,
  formatDuration,
  mode,
}: TranscriptHeaderProps) {
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleExport = async (format: "json" | "txt") => {
    if (!transcript) return;
    setExportOpen(false);

    if (format === "json") {
      const data = JSON.stringify(
        {
          fileName: audioFile?.fileName ?? transcript.audioFileId,
          segments: transcript.segments,
        },
        null,
        2
      );
      downloadFile(data, `${audioFile?.fileName ?? "transcript"}.json`, "application/json");
    } else {
      const text = transcript.segments
        .map((s) => `[${formatDuration(s.startTime)} → ${formatDuration(s.endTime)}] ${s.speaker}: ${s.content}`)
        .join("\n\n");
      downloadFile(text, `${audioFile?.fileName ?? "transcript"}.txt`, "text/plain");
    }
  };

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const pageTitle = mode === "view" ? "Xem Bản Dịch" : "Chỉnh sửa Bản Dịch";
  const modeBadgeColor = mode === "view" ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600";

  return (
    <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-sm shadow-slate-100/50">
        <div className="px-6 py-4">
          {/* Top row: back + title + export */}
          <div className="flex items-center justify-between gap-4">
            {/* Back button */}
            <Link
              href="/transcripts"
              className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-red-500 transition-colors shrink-0"
            >
              <ChevronLeft size={16} />
              <span>Danh sách</span>
            </Link>

            {/* Center: File name + mode badge */}
            <div className="flex items-center gap-3 min-w-0">
              <h1
                className="text-sm font-black text-slate-800 truncate"
                title={audioFile?.fileName ?? ""}
              >
                {audioFile?.fileName ?? "Đang tải..."}
              </h1>
              <span className={`shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full border ${modeBadgeColor}`}>
                {pageTitle}
              </span>
            </div>

            {/* Right: Export dropdown */}
            <div className="relative shrink-0" ref={exportRef}>
              <button
                onClick={() => setExportOpen((v) => !v)}
                className="flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-slate-600 hover:text-red-500 bg-white border border-slate-200 hover:border-red-200 rounded-2xl transition-all shadow-sm"
              >
                <FileDown size={14} />
                <span>Xuất dữ liệu</span>
              </button>

              {exportOpen && (
                <div className="absolute right-0 top-full mt-2 bg-white border border-slate-100 rounded-2xl shadow-xl shadow-slate-200/50 p-1.5 min-w-[160px] z-50 animate-scale-up">
                  <button
                    onClick={() => handleExport("json")}
                    className="flex items-center gap-2.5 w-full px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 rounded-xl transition-all"
                  >
                    <Braces size={14} className="shrink-0" />
                    <span>Xuất JSON</span>
                  </button>
                  <button
                    onClick={() => handleExport("txt")}
                    className="flex items-center gap-2.5 w-full px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-green-50 hover:text-green-600 rounded-xl transition-all"
                  >
                    <FileText size={14} className="shrink-0" />
                    <span>Xuất TXT</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
  );
}
