"use client";

import { useEffect, useRef } from "react";
import type Quill from "quill";
import * as Y from "yjs";
import { QuillBinding } from "y-quill";

// Import style của Quill (chỉ cần import một lần; Next.js tự động khử trùng lặp)
import "quill/dist/quill.snow.css";
import "quill-cursors/css";

let cursorsRegistered = false;

interface QuillEditorProps {
  /** ID của Segment — dùng để tra cứu Y.Text tương ứng */
  segmentId: string;
  /** Callback để lấy đối tượng Y.Text cho segment này. Trả về undefined nếu chưa sẵn sàng. */
  getYText: (segmentId: string) => Y.Text | undefined;
  /** Callback để lấy đối tượng Yjs Awareness */
  getAwareness?: () => any;
  /** Người dùng hiện tại có quyền chỉnh sửa hay không */
  canEdit: boolean;
  /** Nội dung văn bản thô ban đầu — dùng làm dữ liệu seed duy nhất MỘT LẦN nếu Y.Text chưa sẵn sàng */
  initialContent: string;
  /** Được gọi khi nội dung thay đổi (văn bản thô) */
  onContentChange: (content: string) => void;
}

export function QuillEditor({
  segmentId,
  getYText,
  getAwareness,
  canEdit,
  initialContent,
  onContentChange,
}: QuillEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<Quill | null>(null);
  const bindingRef = useRef<QuillBinding | null>(null);
  const onContentChangeRef = useRef(onContentChange);
  onContentChangeRef.current = onContentChange;

  // Lưu trữ các refs cho các giá trị sử dụng bên trong effect để không cần khai báo chúng làm dependencies.
  // Nhờ đó thực thể Quill chỉ được tạo MỘT LẦN cho mỗi segment và không bao giờ bị hủy
  // chỉ vì component cha re-render với nội dung mới (cơ chế binding của Y.js tự lo phần đồng bộ nội dung).
  const getYTextRef = useRef(getYText);
  getYTextRef.current = getYText;

  const getAwarenessRef = useRef(getAwareness);
  getAwarenessRef.current = getAwareness;

  const initialContentRef = useRef(initialContent);
  // Cố ý KHÔNG cập nhật — chỉ sử dụng giá trị lúc mount làm dữ liệu seed ban đầu

  // SỬA LỖI: chỉ phụ thuộc vào [segmentId, canEdit] để không bao giờ khởi tạo lại Quill
  // editor mỗi khi nội dung collab cập nhật. Trước đây [getYText, initialContent] nằm trong
  // deps array, khiến một thực thể Quill mới bị chèn thêm vào DOM sau mỗi lần nội dung Y.js từ xa cập nhật
  // dẫn đến việc xuất hiện nhiều thanh công cụ (toolbar) xếp chồng lên nhau ở mỗi segment.
  useEffect(() => {
    if (!containerRef.current) return;

    let destroyed = false;

    const init = async () => {
      const { default: QuillLib } = await import("quill");
      const { default: QuillCursors } = await import("quill-cursors");
      const { QuillBinding: QB } = await import("y-quill");

      if (destroyed || !containerRef.current) return;

      // Guard: Nếu Quill đã được khởi tạo cho lượt mount này, bỏ qua
      if (quillRef.current) return;

      if (!cursorsRegistered) {
        QuillLib.register("modules/cursors", QuillCursors);
        cursorsRegistered = true;
      }

      const quill = new QuillLib(containerRef.current, {
        theme: "snow",
        placeholder: "Nhập nội dung...",
        readOnly: !canEdit, // Cấu hình readOnly động dựa trên canEdit
        modules: {
          cursors: true, // Kích hoạt module cursors để hiển thị con trỏ chuột
          toolbar: canEdit ? [ // Chỉ hiện toolbar nếu có quyền edit
            ["bold", "italic", "underline", "strike"],
            [{ script: "sub" }, { script: "super" }],
            [{ list: "ordered" }, { list: "bullet" }],
            ["clean"],
          ] : false, // Ẩn toolbar cho viewer
        },
      });

      if (destroyed) return;
      quillRef.current = quill;

      // Thử liên kết (bind) với Y.Text ngay lập tức; nếu chưa sẵn sàng, poll liên tục đến khi có
      const tryBind = () => {
        const yText = getYTextRef.current(segmentId);
        const awareness = getAwarenessRef.current?.();
        if (yText) {
          if (bindingRef.current) return; // Đã được liên kết (bound) rồi
          bindingRef.current = new QB(yText, quill, awareness);
          // Auto-focus when binding completes
          setTimeout(() => {
            if (!destroyed) {
              quill.focus();
            }
          }, 50);
        } else {
          // Y.Text chưa sẵn sàng (doc đang đồng bộ) — seed tạm văn bản thô ban đầu và chạy polling
          if (initialContentRef.current && quill.getLength() <= 1) {
            quill.setText(initialContentRef.current);
          }
          const checkInterval = setInterval(() => {
            if (destroyed) { clearInterval(checkInterval); return; }
            const yt = getYTextRef.current(segmentId);
            const aw = getAwarenessRef.current?.();
            if (yt) {
              clearInterval(checkInterval);
              if (!bindingRef.current) {
                bindingRef.current = new QB(yt, quill, aw);
                setTimeout(() => {
                  if (!destroyed) {
                    quill.focus();
                  }
                }, 50);
              }
            }
          }, 200);
          (quill as any)._cleanupInterval = checkInterval;
        }
      };

      tryBind();

      // Đồng bộ các thay đổi văn bản thô ngược về component cha để cập nhật các chỉ báo trạng thái
      quill.on("text-change", () => {
        onContentChangeRef.current?.(quill.getText().slice(0, -1)); // Loại bỏ ký tự xuống dòng (\n) thừa ở cuối của Quill
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
      // Dọn dẹp và xóa bỏ Quill ra khỏi DOM
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
      quillRef.current = null;
    };
  }, [segmentId, canEdit]); // ← CHỈ duy nhất 2 giá trị này: không bao giờ tạo lại khi nội dung collab thay đổi

  return (
    <div className="quill-editor-wrapper">
      {/* Quill sẽ tự inject các style của nó; chúng ta chỉ cung cấp thẻ chứa làm điểm mount */}
      <div
        ref={containerRef}
        className={`quill-container [&_.ql-editor]:!p-3 [&_.ql-editor]:!min-h-[64px] [&_.ql-editor]:!text-xs [&_.ql-editor]:!leading-relaxed [&_.ql-toolbar]:!border-slate-200 [&_.ql-container]:!border-slate-200 [&_.ql-toolbar.ql-snow_.ql-stroke]:!stroke-slate-400 [&_.ql-toolbar.ql-snow_.ql-fill]:!fill-slate-400 ${
          canEdit
            ? "[&_.ql-editor]:!text-slate-700"
            : "[&_.ql-editor]:!text-slate-500 [&_.ql-container]:!border-transparent bg-transparent cursor-default select-text"
        }`}
      />
    </div>
  );
}
