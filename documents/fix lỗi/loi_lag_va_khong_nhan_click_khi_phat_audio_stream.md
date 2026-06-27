# Báo Cáo Khắc Phục Lỗi: Giật Lag Trình Phát (Audio Stream) và Không Nhận Sự Kiện Click Segment

Tài liệu này ghi nhận nguyên nhân, phân tích kỹ thuật và giải pháp đã triển khai để khắc phục sự cố đơ lag trình duyệt và không phản hồi sự kiện click chuyển đoạn khi phát âm thanh đồng bộ bản dịch tại màn hình View/Edit.

---

## 1. Mô tả Sự cố (Bug Symptoms)
* **Hiện tượng**:
  * Khi bật trình phát nhạc đồng bộ văn bản bản dịch, trình duyệt gặp hiện tượng giật đơ (FPS giảm) và trễ (latency) khi người dùng thực hiện thao tác click.
  * Màn hình liên tục bị giật cục và tự động kéo về giữa khi phát âm thanh, gây khó khăn cho việc cuộn xem bản dịch thủ công của người dùng.
  * Người dùng bấm vào thẻ segment để phát từ đoạn đó nhưng nhiều lúc không nhận (chỉ khi click chính xác vào đoạn text chữ nhỏ thì mới nhận, click vào vùng trống khác của thẻ không có phản hồi).

---

## 2. Phân tích Nguyên nhân Gốc rễ (Root Cause Analysis)

### 2.1. Re-render Dư thừa Quy mô Lớn (O(N) Rendering)
* Trình phát âm thanh phát ra sự kiện `timeupdate` khoảng **4 lần/giây** để cập nhật thời gian phát hiện tại (`currentTime`).
* Mỗi khi `currentTime` thay đổi, state ở component cha `TranscriptViewPage`/`TranscriptEditPage` thay đổi và kích hoạt re-render.
* Do hàm `formatDuration` định nghĩa trong `useTranscriptDetail` là hàm thông thường (không được bọc bởi `useCallback`), nó bị tạo mới địa chỉ tham chiếu sau mỗi lần render.
* Component `TranscriptSegmentItem` không sử dụng `React.memo` để tối ưu hóa. Do đó, cứ mỗi 250ms, toàn bộ danh sách gồm **hàng trăm segment** con đều bị ép dựng lại hoàn toàn ($O(N)$ re-render), dẫn đến quá tải luồng xử lý giao diện (main thread) của trình duyệt.

### 2.2. Phạm vi Click Bị Hẹp (Narrow Click Target)
* Trong file [TranscriptSegmentItem.tsx](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/fe_next/components/transcript/TranscriptSegmentItem.tsx), ở chế độ `view`, sự kiện `onClick` gọi `onSegmentClick` chỉ được đăng ký duy nhất trên thẻ `<p>` hiển thị văn bản nội dung.
* Toàn bộ phần thẻ bao ngoài (`div` container), tên người nói (`speaker`), và thời gian đều không lắng nghe sự kiện này nên click vào đó không có phản hồi phát nhạc.

### 2.3. Tranh chấp Cuộn Màn hình (Scroll Thrashing)
* Ở màn hình View, code cũ sử dụng `scrollIntoView({ behavior: "smooth", block: "center" })` và tự động chạy sau mỗi lần `activeSegmentIndex` thay đổi.
* Tùy chọn `block: "center"` ép trình duyệt liên tục dịch chuyển cuộn để đưa câu thoại đang phát về đúng chính giữa màn hình kể cả khi câu thoại đó **đã hiển thị rõ** trong tầm nhìn của người dùng. Việc này tạo ra xung đột giằng co dữ dội nếu người dùng đang dùng chuột cuộn trang thủ công.

---

## 3. Giải pháp Đã Triển khai (Solution Implemented)

### 3.1. Tối ưu hóa render O(1) bằng `React.memo` & `useCallback`
* **File sửa đổi**: [TranscriptSegmentItem.tsx](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/fe_next/components/transcript/TranscriptSegmentItem.tsx)
  * Bao bọc component `TranscriptSegmentItem` bằng **`memo`** từ React.
* **File sửa đổi**: [use-transcript-detail.ts](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/fe_next/hooks/use-transcript-detail.ts)
  * Bọc hàm `formatDuration` bằng **`useCallback`** để giữ nguyên tham chiếu qua các lần render:
    ```typescript
    const formatDuration = useCallback((seconds: number) => {
      if (!seconds || seconds <= 0) return "--:--";
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
    }, []);
    ```
* **Hiệu quả**: Trình duyệt chỉ render lại tối đa **2 segment** (segment vừa kích hoạt và segment trước đó) mỗi khi thay đổi câu thoại, giảm tải xử lý từ $O(N)$ về $O(1)$. Trình duyệt chạy cực kỳ mượt mà.

### 3.2. Mở rộng Click Target cho Thẻ Segment
* **File sửa đổi**: [TranscriptSegmentItem.tsx](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/fe_next/components/transcript/TranscriptSegmentItem.tsx)
  * Đăng ký lắng nghe sự kiện click trên toàn bộ container thẻ `div` cho cả chế độ `view`.
  * Trong chế độ `edit`, bỏ qua sự kiện click nếu click vào input đổi tên người nói (`!target.closest("input")`), ngăn việc nhạc bị nhảy giây vô lý khi đang gõ chữ.
    ```typescript
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
    ```

### 3.3. Cải tiến Cuộn Thông minh (Smart Viewport Scroll)
* **File sửa đổi**: [page.tsx (view)](file:///d:/VDT_Tucode/VDT_miniproject_TranscriptHub/fe_next/app/(dashboard)/transcripts/[fileId]/view/page.tsx)
  * Sử dụng `getBoundingClientRect()` để kiểm tra xem câu thoại đang hoạt động đã hiển thị trên màn hình chưa.
  * Chỉ gọi lệnh cuộn nếu câu đó đã trôi hoàn toàn ra ngoài tầm nhìn của người dùng.
  * Đổi cấu hình `block` từ `"center"` sang `"nearest"` để cuộn tối thiểu, tạo trải nghiệm êm ái hơn.
    ```typescript
    useEffect(() => {
      if (activeSegmentIndex === null) return;
      const element = segmentRefs.current[activeSegmentIndex];
      if (!element) return;

      const rect = element.getBoundingClientRect();
      const isInViewport =
        rect.top >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight);

      if (!isInViewport) {
        element.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }
    }, [activeSegmentIndex]);
    ```
