import React from "react";
import { AlertTriangle, X, CheckCircle2, Info, XCircle } from "lucide-react";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel?: () => void;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
  isAlert?: boolean;
  type?: 'warning' | 'success' | 'info' | 'error';
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = "Xác nhận",
  cancelText = "Hủy",
  isDanger = false,
  isAlert = false,
  type = 'warning',
}: ConfirmModalProps) {
  if (!isOpen) return null;

  // Determine icon and color classes
  let icon = <AlertTriangle size={28} />;
  let iconBgClass = "bg-amber-50 text-amber-500";
  
  if (type === 'success') {
    icon = <CheckCircle2 size={28} />;
    iconBgClass = "bg-green-50 text-green-500";
  } else if (type === 'error' || isDanger) {
    icon = <XCircle size={28} />;
    iconBgClass = "bg-red-50 text-red-500";
  } else if (type === 'info') {
    icon = <Info size={28} />;
    iconBgClass = "bg-blue-50 text-blue-500";
  }

  const handleClose = onCancel || onConfirm;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-6 max-w-sm w-full border border-slate-100 shadow-2xl animate-scale-up space-y-6 text-center">
        <div className="flex justify-between items-center pb-2">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            {isAlert ? "Thông báo" : "Xác nhận hành động"}
          </span>
          <button
            onClick={handleClose}
            className="p-1 hover:bg-slate-50 text-slate-400 hover:text-slate-700 rounded-full transition-all cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          <div className={`w-14 h-14 ${iconBgClass} rounded-full flex items-center justify-center mx-auto`}>
            {icon}
          </div>
          
          <div className="space-y-2">
            <h3 className="text-base font-black text-slate-800 tracking-tight">{title}</h3>
            <p className="text-xs text-slate-400 font-bold leading-relaxed">
              {message}
            </p>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          {!isAlert && (
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-3 text-xs font-bold text-slate-500 hover:bg-slate-50 border border-slate-100 hover:border-slate-200 rounded-2xl transition-all cursor-pointer"
            >
              {cancelText}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            className={`py-3 text-xs font-bold text-white rounded-2xl shadow-md transition-all cursor-pointer ${
              isAlert ? "w-full" : "flex-1"
            } ${
              isDanger || type === 'error'
                ? "bg-red-500 hover:bg-red-600 shadow-red-500/20" 
                : "bg-slate-800 hover:bg-slate-900 shadow-slate-800/20"
            }`}
          >
            {isAlert ? "Đóng" : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
