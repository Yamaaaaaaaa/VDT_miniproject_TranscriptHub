"use client";

import { useEffect, useRef } from "react";
import type Quill from "quill";
import * as Y from "yjs";
import { QuillBinding } from "y-quill";

// Import Quill styles (must be imported once; Next.js deduplicates)
import "quill/dist/quill.snow.css";

interface QuillEditorProps {
  /** Segment ID — used to look up the corresponding Y.Text */
  segmentId: string;
  /** Callback to resolve Y.Text for this segment. Returns undefined if not ready. */
  getYText: (segmentId: string) => Y.Text | undefined;
  /** Whether the current user has edit permission */
  canEdit: boolean;
  /** Initial plain text content — used ONCE as seed if Y.Text isn't ready yet */
  initialContent: string;
  /** Called when content changes (plain text) */
  onContentChange: (content: string) => void;
}

export function QuillEditor({
  segmentId,
  getYText,
  canEdit,
  initialContent,
  onContentChange,
}: QuillEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<Quill | null>(null);
  const bindingRef = useRef<QuillBinding | null>(null);
  const onContentChangeRef = useRef(onContentChange);
  onContentChangeRef.current = onContentChange;

  // Keep refs for values used inside the effect so we don't need them as deps.
  // This way the Quill instance is created ONCE per segment and never destroyed
  // just because the parent re-renders with new content (Y.js binding handles that).
  const getYTextRef = useRef(getYText);
  getYTextRef.current = getYText;

  const initialContentRef = useRef(initialContent);
  // intentionally NOT updated — only the mount-time value is used as seed

  // FIX: only depend on [segmentId, canEdit] so we never recreate the Quill
  // editor on collab content updates. Previously [getYText, initialContent] were
  // in the deps array, causing a new Quill instance to be appended to the DOM on
  // every remote Y.js change → multiple toolbars stacking up per segment.
  useEffect(() => {
    if (!containerRef.current || !canEdit) return;

    let destroyed = false;

    const init = async () => {
      const { default: QuillLib } = await import("quill");
      const { QuillBinding: QB } = await import("y-quill");

      if (destroyed || !containerRef.current) return;

      // Guard: if Quill already initialised for this mount, skip
      if (quillRef.current) return;

      const quill = new QuillLib(containerRef.current, {
        theme: "snow",
        placeholder: "Nhập nội dung...",
        modules: {
          toolbar: [
            ["bold", "italic", "underline", "strike"],
            [{ script: "sub" }, { script: "super" }],
            [{ list: "ordered" }, { list: "bullet" }],
            ["clean"],
          ],
        },
      });

      if (destroyed) return;
      quillRef.current = quill;

      // Try to bind to Y.Text immediately; if not ready yet, poll until available
      const tryBind = () => {
        const yText = getYTextRef.current(segmentId);
        if (yText) {
          if (bindingRef.current) return; // already bound
          bindingRef.current = new QB(yText, quill);
        } else {
          // Y.Text not ready (doc still syncing) — seed with plain text and poll
          if (initialContentRef.current && quill.getLength() <= 1) {
            quill.setText(initialContentRef.current);
          }
          const checkInterval = setInterval(() => {
            if (destroyed) { clearInterval(checkInterval); return; }
            const yt = getYTextRef.current(segmentId);
            if (yt) {
              clearInterval(checkInterval);
              if (!bindingRef.current) {
                bindingRef.current = new QB(yt, quill);
              }
            }
          }, 200);
          (quill as any)._cleanupInterval = checkInterval;
        }
      };

      tryBind();

      // Sync plain text changes back to parent for toolbar indicators
      quill.on("text-change", () => {
        onContentChangeRef.current?.(quill.getText().slice(0, -1)); // strip trailing newline
      });
    };

    init();

    return () => {
      destroyed = true;
      if ((quillRef.current as any)?._cleanupInterval) {
        clearInterval((quillRef.current as any)?._cleanupInterval);
      }
      if (bindingRef.current) {
        bindingRef.current.destroy();
        bindingRef.current = null;
      }
      // Remove Quill from DOM cleanly
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
      quillRef.current = null;
    };
  }, [segmentId, canEdit]); // ← ONLY these two: never recreate for content updates

  // For VIEWER or when not editing: render read-only plain text
  if (!canEdit) {
    return (
      <div className="quill-viewer text-xs text-slate-700 leading-relaxed whitespace-pre-wrap break-words px-2 py-1">
        {initialContent || ""}
      </div>
    );
  }

  return (
    <div className="quill-editor-wrapper">
      {/* Quill injects its own styles; we just provide the mount point */}
      <div
        ref={containerRef}
        className="quill-container [&_.ql-editor]:!p-1 [&_.ql-editor]:!text-xs [&_.ql-editor]:!text-slate-700 [&_.ql-editor]:!leading-relaxed [&_.ql-toolbar]:!border-slate-200 [&_.ql-container]:!border-slate-200 [&_.ql-toolbar.ql-snow_.ql-stroke]:!stroke-slate-400 [&_.ql-toolbar.ql-snow_.ql-fill]:!fill-slate-400"
      />
    </div>
  );
}
