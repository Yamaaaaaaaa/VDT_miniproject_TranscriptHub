"use client";

import Link from "next/link";
import { ShieldAlert, ArrowLeft } from "lucide-react";

export default function UnauthorizedPage() {
  return (
    <div className="h-[calc(100vh-180px)] flex items-center justify-center p-4">
      <div className="text-center space-y-6 max-w-md bg-white border border-slate-100 p-10 rounded-3xl shadow-xl shadow-slate-200/50">
        <div className="inline-flex p-5 bg-red-50 text-red-500 border border-red-100 rounded-2xl mb-2">
          <ShieldAlert size={40} />
        </div>
        <h1 className="text-2xl font-black text-slate-800 tracking-tight">Từ chối truy cập</h1>
        <p className="text-sm text-slate-400 leading-relaxed">
          Tài khoản của bạn không có đủ quyền hạn hoặc vai trò cần thiết để truy cập chức năng này. Vui lòng liên hệ Quản trị viên tối cao để được phân quyền.
        </p>
        
        <div className="pt-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-red-500 hover:text-red-600 font-bold transition-all cursor-pointer"
          >
            <ArrowLeft size={18} />
            <span>Quay về Dashboard</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
