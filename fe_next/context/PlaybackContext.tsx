"use client";

import React, { createContext, useContext, useEffect, useRef } from "react";
import { TranscriptSegment } from "@/types/transcript";

export class PlaybackManager {
  private audio: HTMLAudioElement | null = null;
  private segments: TranscriptSegment[] = [];
  private activeSegmentIndex: number | null = null;
  private isPlaying = false;
  private volume = 0.8;
  private duration = 0;
  private playbackRate = 1.0;

  // Subscription sets for pub-sub
  private timeListeners = new Set<(time: number) => void>();
  private activeSegmentListeners = new Set<(index: number | null) => void>();
  private stateListeners = new Set<(isPlaying: boolean) => void>();
  private durationListeners = new Set<(duration: number) => void>();
  private volumeListeners = new Set<(volume: number) => void>();
  private playbackRateListeners = new Set<(rate: number) => void>();

  constructor(
    private fileId: string,
    private token: string
  ) {
    if (typeof window !== "undefined") {
      this.audio = new Audio(`/api/files/stream/${fileId}?token=${token}`);
      this.audio.volume = this.volume;
      this.audio.playbackRate = this.playbackRate;

      this.audio.addEventListener("timeupdate", this.handleTimeUpdate);
      this.audio.addEventListener("loadedmetadata", this.handleLoadedMetadata);
      this.audio.addEventListener("ended", this.handleAudioEnded);
    }
  }

  setSegments(segs: TranscriptSegment[]) {
    this.segments = segs;
    this.recalculateActiveSegment();
  }

  // Event handlers
  private handleTimeUpdate = () => {
    if (!this.audio) return;
    const time = this.audio.currentTime;
    
    // Notify time listeners
    this.timeListeners.forEach((l) => l(time));
    
    // Check and notify active segment change
    this.recalculateActiveSegment();
  };

  private handleLoadedMetadata = () => {
    if (!this.audio) return;
    this.duration = this.audio.duration;
    this.durationListeners.forEach((l) => l(this.duration));
  };

  private handleAudioEnded = () => {
    this.isPlaying = false;
    this.stateListeners.forEach((l) => l(false));
    
    this.timeListeners.forEach((l) => l(0));
    this.activeSegmentIndex = null;
    this.activeSegmentListeners.forEach((l) => l(null));
  };

  private recalculateActiveSegment() {
    if (!this.audio || this.segments.length === 0) return;
    const time = this.audio.currentTime;
    
    const idx = this.segments.findIndex(
      (s, i) =>
        time >= s.startTime &&
        (i === this.segments.length - 1 || time < this.segments[i + 1].startTime)
    );

    const targetIdx = idx !== -1 ? idx : null;
    if (targetIdx !== this.activeSegmentIndex) {
      this.activeSegmentIndex = targetIdx;
      this.activeSegmentListeners.forEach((l) => l(targetIdx));
    }
  }

  // Subscriptions
  subscribeToTime(callback: (time: number) => void) {
    this.timeListeners.add(callback);
    if (this.audio) callback(this.audio.currentTime);
    return () => {
      this.timeListeners.delete(callback);
    };
  }

  subscribeToActiveSegment(callback: (index: number | null) => void) {
    this.activeSegmentListeners.add(callback);
    callback(this.activeSegmentIndex);
    return () => {
      this.activeSegmentListeners.delete(callback);
    };
  }

  subscribeToState(callback: (isPlaying: boolean) => void) {
    this.stateListeners.add(callback);
    callback(this.isPlaying);
    return () => {
      this.stateListeners.delete(callback);
    };
  }

  subscribeToDuration(callback: (duration: number) => void) {
    this.durationListeners.add(callback);
    callback(this.duration);
    return () => {
      this.durationListeners.delete(callback);
    };
  }

  subscribeToVolume(callback: (volume: number) => void) {
    this.volumeListeners.add(callback);
    callback(this.volume);
    return () => {
      this.volumeListeners.delete(callback);
    };
  }

  subscribeToPlaybackRate(callback: (rate: number) => void) {
    this.playbackRateListeners.add(callback);
    callback(this.playbackRate);
    return () => {
      this.playbackRateListeners.delete(callback);
    };
  }

  // Playback Controls
  togglePlay() {
    if (!this.audio) return;
    if (this.isPlaying) {
      this.audio.pause();
      this.isPlaying = false;
      this.stateListeners.forEach((l) => l(false));
    } else {
      this.audio.play().catch((e) => console.error("Playback error:", e));
      this.isPlaying = true;
      this.stateListeners.forEach((l) => l(true));
    }
  }

  seekTo(time: number) {
    if (!this.audio) return;
    this.audio.currentTime = time;
    this.timeListeners.forEach((l) => l(time));
    this.recalculateActiveSegment();

    if (!this.isPlaying) {
      this.audio.play().catch((e) => console.error("Playback error:", e));
      this.isPlaying = true;
      this.stateListeners.forEach((l) => l(true));
    }
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.audio) {
      this.audio.volume = v;
    }
    this.volumeListeners.forEach((l) => l(v));
  }

  setPlaybackRate(rate: number) {
    this.playbackRate = rate;
    if (this.audio) {
      this.audio.playbackRate = rate;
    }
    this.playbackRateListeners.forEach((l) => l(rate));
  }

  getCurrentTime() {
    return this.audio?.currentTime ?? 0;
  }

  getDuration() {
    return this.duration;
  }

  getVolume() {
    return this.volume;
  }

  getIsPlaying() {
    return this.isPlaying;
  }

  getActiveSegmentIndex() {
    return this.activeSegmentIndex;
  }

  destroy() {
    if (this.audio) {
      this.audio.pause();
      this.audio.removeEventListener("timeupdate", this.handleTimeUpdate);
      this.audio.removeEventListener("loadedmetadata", this.handleLoadedMetadata);
      this.audio.removeEventListener("ended", this.handleAudioEnded);
      this.audio = null;
    }
    this.timeListeners.clear();
    this.activeSegmentListeners.clear();
    this.stateListeners.clear();
    this.durationListeners.clear();
    this.volumeListeners.clear();
    this.playbackRateListeners.clear();
  }
}

const PlaybackContext = createContext<PlaybackManager | null>(null);

export function PlaybackProvider({
  fileId,
  token,
  children,
}: {
  fileId: string;
  token: string;
  children: React.ReactNode;
}) {
  const managerRef = useRef<PlaybackManager | null>(null);

  if (!managerRef.current && fileId && token) {
    managerRef.current = new PlaybackManager(fileId, token);
  }

  useEffect(() => {
    return () => {
      if (managerRef.current) {
        managerRef.current.destroy();
        managerRef.current = null;
      }
    };
  }, []);

  return (
    <PlaybackContext.Provider value={managerRef.current}>
      {children}
    </PlaybackContext.Provider>
  );
}

export function usePlayback() {
  const context = useContext(PlaybackContext);
  return context;
}
