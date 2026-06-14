"use client";

import React, { useState, useEffect, useRef, useMemo, use } from "react";
import { useRouter } from "next/navigation";
import { transcriptsApi, filesApi } from "@/lib/api";
import {
  Search, Play, Pause, Download, Volume2, VolumeX, Users, ArrowLeft,
  FileJson, FileCheck, AlertCircle, Loader2, X, Clock, HelpCircle, FileText
} from "lucide-react";

interface TranscriptSegment {
  id: string;
  startTime: number;
  endTime: number;
  speaker: string;
  text: string;
}

interface TranscriptDetailInnerProps {
  fileId: string;
}

function TranscriptDetailInner({ fileId }: TranscriptDetailInnerProps) {
  const router = useRouter();

  // Detail view state
  const [selectedTranscript, setSelectedTranscript] = useState<any | null>(null);
  const [associatedFile, setAssociatedFile] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  // Search filter within segments
  const [segmentFilter, setSegmentFilter] = useState<string>("");

  // Audio Playback
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(0.8);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const segmentRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Load transcript and file metadata
  useEffect(() => {
    const loadData = async () => {
      if (!fileId) {
        setError("Mã file không hợp lệ.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");
      try {
        const [transcript, fileInfo] = await Promise.all([
          transcriptsApi.getByAudioFile(fileId),
          filesApi.getMetadata(fileId)
        ]);

        if (transcript.status !== "COMPLETED") {
          throw new Error("Bản dịch chưa hoàn tất hoặc bị lỗi, không thể xem chi tiết.");
        }

        setSelectedTranscript(transcript);
        setAssociatedFile(fileInfo);
      } catch (err: any) {
        console.error(err);
        setError(err?.response?.data?.message || err.message || "Không thể tải chi tiết bản dịch.");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [fileId]);

  // Parse structuredContent segments safely
  const segmentsList = useMemo((): TranscriptSegment[] => {
    if (!selectedTranscript) return [];

    let content = selectedTranscript.structuredContent;

    // If it's a string, try to parse it
    if (typeof content === "string") {
      try {
        const parsed = JSON.parse(content);
        return parsed.segments || [];
      } catch (e) {
        console.error("Failed to parse structuredContent string:", e);
        return [];
      }
    }

    // If it is already parsed (as TranscriptContent object)
    if (content && Array.isArray(content.segments)) {
      return content.segments;
    }

    return [];
  }, [selectedTranscript]);

  // Compute active segment based on current audio timestamp
  const activeSegmentId = useMemo(() => {
    if (segmentsList.length === 0 || currentTime === 0) return null;

    const active = segmentsList.find(
      (seg) => currentTime >= seg.startTime && currentTime <= seg.endTime
    );

    return active ? active.id : null;
  }, [segmentsList, currentTime]);

  // Auto-scroll active segment into view
  useEffect(() => {
    if (activeSegmentId) {
      const el = segmentRefs.current[activeSegmentId];
      if (el) {
        el.scrollIntoView({
          behavior: "smooth",
          block: "nearest"
        });
      }
    }
  }, [activeSegmentId]);

  // Filter segments by search keyword
  const filteredSegments = useMemo(() => {
    if (!segmentFilter.trim()) return segmentsList;
    const q = segmentFilter.toLowerCase().trim();
    return segmentsList.filter(
      (seg) =>
        seg.text.toLowerCase().includes(q) ||
        (seg.speaker && seg.speaker.toLowerCase().includes(q))
    );
  }, [segmentsList, segmentFilter]);

  // Audio Playback Events
  const handlePlayPause = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch((e) => {
          console.error("Audio playback error:", e);
          alert("Không thể phát âm thanh của tệp này.");
        });
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleSeek = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleSegmentClick = (startTime: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = startTime;
      setCurrentTime(startTime);
      if (!isPlaying) {
        audioRef.current
          .play()
          .then(() => setIsPlaying(true))
          .catch((e) => console.error(e));
      }
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    setVolume(vol);
    setIsMuted(vol === 0);
    if (audioRef.current) {
      audioRef.current.volume = vol;
      audioRef.current.muted = vol === 0;
    }
  };

  const handleToggleMute = () => {
    const muted = !isMuted;
    setIsMuted(muted);
    if (audioRef.current) {
      audioRef.current.muted = muted;
    }
  };

  // Formatting helpers
  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds === null) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return "";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const downloadTxt = () => {
    if (!selectedTranscript || !associatedFile) return;

    let textContent = `BẢN DỊCH VĂN BẢN: ${associatedFile.fileName}\n`;
    textContent += `Thời gian xuất: ${new Date().toLocaleString("vi-VN")}\n`;
    textContent += `========================================================\n\n`;

    if (segmentsList.length > 0) {
      segmentsList.forEach((seg) => {
        const timeline = `[${formatTime(seg.startTime)} - ${formatTime(seg.endTime)}]`;
        textContent += `${timeline} ${seg.speaker || "Người nói"}: ${seg.text}\n\n`;
      });
    } else {
      textContent += selectedTranscript.rawText || "Không có nội dung.";
    }

    const blob = new Blob([textContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${associatedFile.fileName.replace(/\.[^/.]+$/, "")}_transcript.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadJson = () => {
    if (!selectedTranscript || !associatedFile) return;

    const exportData = {
      fileId: associatedFile.id,
      fileName: associatedFile.fileName,
      durationSeconds: associatedFile.durationSeconds,
      fileSize: associatedFile.fileSize,
      transcriptId: selectedTranscript.id,
      rawText: selectedTranscript.rawText,
      segments: segmentsList,
      exportedAt: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${associatedFile.fileName.replace(/\.[^/.]+$/, "")}_transcript.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const highlightText = (text: string, highlight: string) => {
    if (!highlight.trim()) return <span>{text}</span>;

    const parts = text.split(
      new RegExp(`(${highlight.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&")})`, "gi")
    );
    return (
      <span>
        {parts.map((part, i) =>
          part.toLowerCase() === highlight.toLowerCase() ? (
            <mark
              key={i}
              className="bg-yellow-200 text-yellow-800 px-1 py-0.5 rounded font-extrabold"
            >
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </span>
    );
  };

  return (
    <div className="space-y-6 flex flex-col h-[calc(100vh-140px)]">
      {/* Detail header toolbar */}
      <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm flex items-center justify-between shrink-0 gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/transcripts")}
            className="p-2 border border-slate-200 hover:border-slate-300 text-slate-600 hover:text-slate-800 rounded-full transition-all cursor-pointer flex items-center justify-center w-10 h-10 shrink-0"
            title="Quay lại danh sách"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="min-w-0">
            <h3 className="text-base font-extrabold text-slate-800 truncate max-w-md" title={associatedFile?.fileName}>
              {associatedFile?.fileName || "Chi tiết bản dịch"}
            </h3>
            <p className="text-[10px] font-bold text-slate-400 mt-0.5">
              Thời lượng: {formatTime(associatedFile?.durationSeconds || 0)} | Dung lượng: {formatSize(associatedFile?.fileSize)}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={downloadTxt}
            className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:border-slate-300 rounded-2xl shadow-sm transition-all cursor-pointer"
          >
            <Download size={14} />
            <span>Xuất TXT</span>
          </button>
          <button
            onClick={downloadJson}
            className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:border-slate-300 rounded-2xl shadow-sm transition-all cursor-pointer"
          >
            <FileJson size={14} />
            <span>Xuất JSON</span>
          </button>
        </div>
      </div>

      {/* Split Panel Layout */}
      <div className="flex flex-1 gap-6 overflow-hidden min-h-0 flex-col lg:flex-row">
        {/* Left Panel: Audio Control & metrics */}
        <div className="w-full lg:w-80 flex flex-col gap-6 shrink-0">
          {/* Audio Player Card */}
          <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm space-y-4">
            <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Trình Phát Audio</h4>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col gap-3.5">
              <audio
                ref={audioRef}
                src={associatedFile ? `/api/files/stream/${associatedFile.id}` : undefined}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={handleAudioEnded}
                className="hidden"
              />

              <div className="space-y-1">
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  value={currentTime}
                  onChange={(e) => handleSeek(parseFloat(e.target.value))}
                  className="w-full accent-red-500 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400 font-mono font-bold">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4">
                <button
                  onClick={handlePlayPause}
                  className="w-10 h-10 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-lg shadow-red-500/20 transition-all cursor-pointer"
                >
                  {isPlaying ? (
                    <Pause size={16} fill="white" />
                  ) : (
                    <Play size={16} fill="white" className="ml-0.5" />
                  )}
                </button>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleToggleMute}
                    className="text-slate-400 hover:text-slate-600 transition-all cursor-pointer"
                  >
                    {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="w-16 accent-slate-600 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2.5 text-xs text-slate-500 font-bold border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between">
                <span>Số phân đoạn:</span>
                <span className="text-slate-800">{segmentsList.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Tổng số từ (ước lượng):</span>
                <span className="text-slate-800">
                  {selectedTranscript?.rawText?.split(/\s+/).length || 0} từ
                </span>
              </div>
            </div>
          </div>

          {/* Search Card */}
          <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm flex-1 flex flex-col gap-4 min-h-0">
            <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Tìm kiếm từ khóa</h4>

            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                type="text"
                placeholder="Tìm nội dung câu nói..."
                value={segmentFilter}
                onChange={(e) => setSegmentFilter(e.target.value)}
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-2.5 pl-10 pr-8 text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:border-red-500 focus:bg-white transition-all font-bold"
              />
              {segmentFilter && (
                <button
                  onClick={() => setSegmentFilter("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {segmentFilter && (
              <div className="text-[10px] text-red-500 font-bold">
                Khớp {filteredSegments.length} phân đoạn
              </div>
            )}

            <div className="text-[10px] text-slate-400 font-bold leading-normal bg-slate-50 border border-slate-100 p-4 rounded-2xl mt-auto">
              <h5 className="font-extrabold text-slate-700 mb-1 flex items-center gap-1">
                <HelpCircle size={12} /> Hướng dẫn:
              </h5>
              Nhấp chuột vào bất kỳ đoạn văn bản nào bên phải để tua nhạc nhanh đến thời điểm câu nói bắt đầu phát.
            </div>
          </div>
        </div>

        {/* Right Panel: Scrollable timeline */}
        <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm flex-1 flex flex-col gap-4 overflow-hidden min-h-0">
          <div className="flex items-center justify-between border-b border-slate-50 pb-3 shrink-0">
            <h4 className="text-sm font-extrabold text-slate-800">Dòng thời gian hội thoại</h4>
            <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
              <Clock size={12} /> Phát câu nào tô sáng câu đó
            </span>
          </div>

          <div className="flex-1 overflow-y-auto pr-1 space-y-4">
            {filteredSegments.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-2">
                <Search className="text-slate-300" size={32} />
                <p className="text-xs font-bold">Không tìm thấy phân đoạn văn bản nào khớp.</p>
              </div>
            ) : (
              filteredSegments.map((seg) => {
                const isActive = seg.id === activeSegmentId;
                return (
                  <div
                    key={seg.id}
                    ref={(el) => {
                      segmentRefs.current[seg.id] = el;
                    }}
                    onClick={() => handleSegmentClick(seg.startTime)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col gap-2 relative ${
                      isActive
                        ? "border-red-200 bg-red-50/20 shadow-sm pl-5 border-l-4 border-l-red-500"
                        : "border-slate-100 bg-white hover:bg-slate-50/50 hover:border-slate-200"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <span
                        className={`text-xs font-black flex items-center gap-1.5 ${
                          isActive ? "text-red-500" : "text-slate-700"
                        }`}
                      >
                        <Users size={12} className="text-slate-400" />
                        <span>{seg.speaker || "Người nói"}</span>
                      </span>

                      <span
                        className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded-lg border transition-all ${
                          isActive
                            ? "bg-red-500 text-white border-transparent"
                            : "bg-slate-50 text-slate-400 border-slate-100"
                        }`}
                      >
                        {formatTime(seg.startTime)} - {formatTime(seg.endTime)}
                      </span>
                    </div>

                    <p
                      className={`text-xs leading-relaxed ${
                        isActive ? "text-slate-800 font-bold" : "text-slate-600"
                      }`}
                    >
                      {highlightText(seg.text, segmentFilter)}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TranscriptDetailPage({ params }: { params: Promise<{ fileId: string }> }) {
  const unwrappedParams = use(params);
  return <TranscriptDetailInner fileId={unwrappedParams.fileId} />;
}
