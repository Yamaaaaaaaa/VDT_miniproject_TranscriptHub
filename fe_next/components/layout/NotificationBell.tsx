"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Bell, Trash2, CheckCheck, Inbox, ShieldAlert } from "lucide-react";
import { notificationsApi } from "@/lib/api";

interface Notification {
  id: number;
  userId: number;
  title: string;
  content: string;
  url: string | null;
  isRead: boolean;
  createdAt: string;
}

interface ToastItem {
  id: number;
  title: string;
  content: string;
  url: string | null;
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const popoverRef = useRef<HTMLDivElement>(null);
  const isFirstLoad = useRef(true);
  const notificationsRef = useRef<Notification[]>([]);
  const router = useRouter();

  // Sync ref with state to prevent stale closure in polling
  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  // Lấy danh sách thông báo từ API
  const fetchNotifications = async () => {
    try {
      const data = await notificationsApi.getAll();
      if (Array.isArray(data)) {
        if (isFirstLoad.current) {
          setNotifications(data);
          isFirstLoad.current = false;
        } else {
          const currentNotifications = notificationsRef.current;
          // Tìm các thông báo mới chưa đọc và chưa có trong state cũ
          const newItems = data.filter(
            (newItem) => !newItem.isRead && !currentNotifications.some((oldItem) => oldItem.id === newItem.id)
          );

          if (newItems.length > 0) {
            newItems.forEach((item) => {
              const toastId = item.id;
              // Thêm vào hàng đợi Toast
              setToasts((prev) => [
                ...prev,
                { id: item.id, title: item.title, content: item.content, url: item.url }
              ]);

              // Tự động tắt Toast sau 6 giây
              setTimeout(() => {
                setToasts((prev) => prev.filter((t) => t.id !== toastId));
              }, 6000);
            });
          }
          setNotifications(data);
        }
      }
    } catch (error) {
      console.error("Lỗi lấy danh sách thông báo:", error);
    }
  };

  // Poll danh sách thông báo mỗi 10 giây
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 10000);
    return () => clearInterval(interval);
  }, []);

  // Xử lý đóng popover khi click ra ngoài
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Số lượng thông báo chưa đọc
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  // Đánh dấu 1 thông báo đã đọc
  const handleRead = async (id: number) => {
    try {
      await notificationsApi.read(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
    } catch (err) {
      console.error("Lỗi đánh dấu đã đọc thông báo:", err);
    }
  };

  // Đánh dấu tất cả đã đọc
  const handleReadAll = async () => {
    if (unreadCount === 0) return;
    setLoading(true);
    try {
      await notificationsApi.readAll();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch (err) {
      console.error("Lỗi đánh dấu đọc tất cả thông báo:", err);
    } finally {
      setLoading(false);
    }
  };

  // Xóa thông báo
  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    try {
      await notificationsApi.delete(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      // Đồng thời tắt toast nếu đang hiển thị
      setToasts((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      console.error("Lỗi xóa thông báo:", err);
    }
  };

  // Click vào dòng thông báo (điều hướng & đánh dấu đọc)
  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.isRead) {
      await handleRead(notification.id);
    }
    setIsOpen(false);
    if (notification.url) {
      router.push(notification.url);
    }
  };

  // Click vào Toast thông báo
  const handleToastClick = async (toast: ToastItem) => {
    await handleRead(toast.id);
    setToasts((prev) => prev.filter((t) => t.id !== toast.id));
    if (toast.url) {
      router.push(toast.url);
    }
  };

  // Định dạng thời gian tương đối
  const formatTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      
      if (diffMins < 1) return "Vừa xong";
      if (diffMins < 60) return `${diffMins} phút trước`;
      if (diffHours < 24) return `${diffHours} giờ trước`;
      return date.toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (_) {
      return "";
    }
  };

  return (
    <div className="relative" ref={popoverRef}>
      {/* CSS Keyframe Animation cho Toast */}
      <style>{`
        @keyframes slideInRight {
          from {
            transform: translateX(120%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-toast-in {
          animation: slideInRight 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>

      {/* Container hiển thị các Toast thông báo mới */}
      <div className="fixed top-6 right-6 flex flex-col gap-3.5 z-[9999] pointer-events-none w-96 max-w-[calc(100vw-3rem)]">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            onClick={() => handleToastClick(toast)}
            className="pointer-events-auto bg-white border border-red-50 rounded-2xl p-4.5 shadow-2xl flex gap-3.5 cursor-pointer hover:-translate-y-0.5 hover:shadow-red-500/5 transition-all duration-300 animate-toast-in border-l-4 border-l-red-500"
          >
            <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center shrink-0 mt-0.5">
              <ShieldAlert size={15} className="text-red-500 animate-bounce" />
            </div>
            <div className="flex-1 min-w-0 pr-1">
              <p className="text-[12px] font-extrabold text-slate-800 leading-normal">
                {toast.title}
              </p>
              <p className="text-[11px] text-slate-500 leading-relaxed mt-1 font-medium break-words">
                {toast.content}
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setToasts((prev) => prev.filter((t) => t.id !== toast.id));
              }}
              className="p-1 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-slate-600 transition-all shrink-0 cursor-pointer self-start -mt-1 -mr-1"
              title="Đóng"
            >
              &times;
            </button>
          </div>
        ))}
      </div>

      {/* Icon chuông thông báo */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2.5 hover:bg-slate-50 text-slate-400 hover:text-slate-700 rounded-xl transition-all relative cursor-pointer focus:outline-none"
        title="Thông báo"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <>
            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full animate-ping" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full" />
          </>
        )}
      </button>

      {/* Popover chứa danh sách thông báo */}
      {isOpen && (
        <div className="absolute right-0 mt-3 w-96 bg-white border border-slate-100 rounded-2xl shadow-xl z-50 overflow-hidden animate-scale-up">
          {/* Header Popover */}
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h3 className="font-extrabold text-sm text-slate-800">Thông báo</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleReadAll}
                disabled={loading}
                className="flex items-center gap-1 text-[11px] font-bold text-red-500 hover:text-red-600 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <CheckCheck size={13} />
                <span>Đọc tất cả</span>
              </button>
            )}
          </div>

          {/* List Body */}
          <div className="max-h-[360px] overflow-y-auto divide-y divide-slate-100">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-5 text-center text-slate-400">
                <Inbox size={32} className="stroke-1 mb-2 text-slate-300" />
                <p className="text-xs font-medium">Hộp thư trống</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Bạn không có thông báo nào.</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`group px-5 py-4 flex gap-3 hover:bg-slate-50/80 transition-all cursor-pointer relative ${
                    !n.isRead ? "bg-slate-50/30" : ""
                  }`}
                >
                  {/* Trạng thái chưa đọc */}
                  {!n.isRead && (
                    <div className="absolute left-2.5 top-5 w-1.5 h-1.5 bg-red-500 rounded-full" />
                  )}

                  {/* Icon loại thông báo */}
                  <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center shrink-0 mt-0.5">
                    <ShieldAlert size={14} className="text-red-500" />
                  </div>

                  {/* Nội dung thông báo */}
                  <div className="flex-1 min-w-0 pr-4">
                    <p className={`text-xs leading-normal ${!n.isRead ? "font-extrabold text-slate-800" : "font-medium text-slate-600"}`}>
                      {n.title}
                    </p>
                    <p className="text-[11px] text-slate-500 leading-relaxed mt-1 font-medium break-words">
                      {n.content}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-2 font-semibold">
                      {formatTime(n.createdAt)}
                    </p>
                  </div>

                  {/* Nút xóa */}
                  <button
                    onClick={(e) => handleDelete(e, n.id)}
                    className="absolute right-3.5 bottom-4 p-1.5 opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all cursor-pointer focus:outline-none"
                    title="Xóa thông báo"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
