"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import api from "@/lib/api";
import { TranscriptDetail, AudioFileMetadata, TranscriptSegment } from "@/types/transcript";

export function useTranscriptDetail(fileId: string) {
  const [transcript, setTranscript] = useState<TranscriptDetail | null>(null);
  const [audioFile, setAudioFile] = useState<AudioFileMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Audio player state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [transcriptData, fileData] = await Promise.all([
        api
          .get(`/transcripts/file/${fileId}`)
          .then((res) => res.data)
          .catch((err) => {
            console.warn("Failed to load transcript:", err);
            return null;
          }),
        api
          .get(`/files/${fileId}`)
          .then((res) => res.data?.result ?? res.data)
          .catch((err) => {
            console.warn("Failed to load file metadata:", err);
            return null;
          }),
      ]);

      // Normalize transcript: extract segments from structuredContent
      let normalized: TranscriptDetail | null = null;
      if (transcriptData) {
        const raw = transcriptData.result ?? transcriptData;
        let segments: TranscriptSegment[] = [];

        // Extract segments from structuredContent if present
        if (raw?.structuredContent?.segments) {
          segments = (raw.structuredContent.segments as any[]).map(
            (s: any, i: number): TranscriptSegment => ({
              id: s.id ?? `seg-${i}`,
              startTime: Number(s.starttime ?? s.startTime ?? 0),
              endTime: Number(s.endtime ?? s.endTime ?? 0),
              speaker: s.speaker ?? s.speakerName ?? "Unknown",
              content: s.text ?? s.content ?? "",
            })
          );
        } else if (Array.isArray(raw?.segments)) {
          segments = (raw.segments as any[]).map(
            (s: any, i: number): TranscriptSegment => ({
              id: s.id ?? `seg-${i}`,
              startTime: Number(s.starttime ?? s.startTime ?? 0),
              endTime: Number(s.endtime ?? s.endTime ?? 0),
              speaker: s.speaker ?? s.speakerName ?? "Unknown",
              content: s.text ?? s.content ?? "",
            })
          );
        }

        normalized = {
          id: raw?.id ?? "",
          audioFileId: fileId,
          status: raw?.status ?? "COMPLETED",
          segments,
          createdAt: raw?.createdAt ?? "",
          updatedAt: raw?.updatedAt ?? "",
        };
      }

      setTranscript(normalized);
      setAudioFile(fileData);
    } catch (err: any) {
      console.error(err);
      setError(err?.response?.data?.message || "Không thể tải dữ liệu bản dịch.");
    } finally {
      setLoading(false);
    }
  }, [fileId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Audio event handlers
  const handleTimeUpdate = useCallback(() => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  }, []);

  const handleAudioEnded = useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(0);
  }, []);

  const initAudio = useCallback(() => {
    if (!audioRef.current && audioFile) {
      audioRef.current = new Audio(`/api/files/stream/${fileId}`);
      audioRef.current.volume = volume;
      audioRef.current.addEventListener("timeupdate", handleTimeUpdate);
      audioRef.current.addEventListener("loadedmetadata", handleLoadedMetadata);
      audioRef.current.addEventListener("ended", handleAudioEnded);
    }
  }, [audioFile, fileId, volume, handleTimeUpdate, handleLoadedMetadata, handleAudioEnded]);

  const togglePlay = useCallback(() => {
    initAudio();
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch((e) => console.error(e));
      setIsPlaying(true);
    }
  }, [isPlaying, initAudio]);

  const seekTo = useCallback(
    (time: number) => {
      initAudio();
      if (!audioRef.current) return;
      audioRef.current.currentTime = time;
      setCurrentTime(time);
      if (!isPlaying) {
        audioRef.current.play().catch((e) => console.error(e));
        setIsPlaying(true);
      }
    },
    [isPlaying, initAudio]
  );

  const handleVolumeChange = useCallback((v: number) => {
    setVolume(v);
    if (audioRef.current) {
      audioRef.current.volume = v;
    }
  }, []);

  const formatDuration = (seconds: number) => {
    if (!seconds || seconds <= 0) return "--:--";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeEventListener("timeupdate", handleTimeUpdate);
        audioRef.current.removeEventListener("loadedmetadata", handleLoadedMetadata);
        audioRef.current.removeEventListener("ended", handleAudioEnded);
        audioRef.current = null;
      }
    };
  }, [handleTimeUpdate, handleLoadedMetadata, handleAudioEnded]);

  return {
    transcript,
    audioFile,
    loading,
    error,
    // Audio state
    isPlaying,
    currentTime,
    duration,
    volume,
    // Audio controls
    togglePlay,
    seekTo,
    handleVolumeChange,
    formatDuration,
    // Ref for external audio element
    audioRef,
    // Reload
    reload: loadData,
  };
}
