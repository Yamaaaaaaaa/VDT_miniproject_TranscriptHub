"use client";

import { useAuth } from "@/hooks/use-auth";
import Link from "next/link";
import { 
  Sparkles, FileAudio, FileText, Users, Shield, ArrowRight, 
  Activity, Star, Flame, LogOut
} from "lucide-react";
import { useEffect, useState } from "react";
import { filesApi, transcriptsApi } from "@/lib/api";

export default function HomePage() {
  const { user, hasPermission } = useAuth();
  const [stats, setStats] = useState({ filesCount: 0, transcriptsCount: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const [filesRes, transcriptsRes] = await Promise.all([
          filesApi.list(0, 1).catch(() => ({ totalElements: 0 })),
          transcriptsApi.getAll(0, 1).catch(() => ({ totalElements: 0 }))
        ]);
        setStats({
          filesCount: filesRes?.totalElements ?? 0,
          transcriptsCount: transcriptsRes?.totalElements ?? 0
        });
      } catch (err) {
        console.error("Failed to load dashboard stats:", err);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  return (
    <div className="space-y-8 pb-12 animate-fade-in">
      {/* Premium Gradient Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-red-950 to-slate-900 text-white p-8 md:p-12 shadow-xl border border-red-900/30">
        <div className="absolute top-0 right-0 w-96 h-96 bg-red-500/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl -ml-20 -mb-20 pointer-events-none" />
        
        <div className="relative z-10 space-y-4 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-bold uppercase tracking-wider">
            <Sparkles size={12} className="animate-pulse" />
            <span>Hệ thống AI Transcribe v1.0</span>
          </div>
          
          <h1 className="text-3xl md:text-5xl font-black tracking-tight leading-tight">
            Chào mừng trở lại, <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-amber-300">{user?.name || "Thành viên"}</span>!
          </h1>
          
          <p className="text-sm md:text-base text-slate-300 font-medium leading-relaxed">
            Hệ thống TranscriptHub giúp bạn lưu trữ, quản lý tệp âm thanh và chuyển đổi giọng nói thành văn bản cực kỳ nhanh chóng bằng mô hình trí tuệ nhân tạo Gemini AI.
          </p>

          <div className="pt-4 flex gap-4 flex-wrap">
            <Link
              href="/files"
              className="px-6 py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-2xl shadow-lg shadow-red-500/20 hover:shadow-xl transition-all duration-200 flex items-center gap-2 text-sm"
            >
              <span>Quản lý File ngay</span>
              <ArrowRight size={16} />
            </Link>
            <Link
              href="/transcripts"
              className="px-6 py-3 bg-white/10 hover:bg-white/15 text-white border border-white/10 hover:border-white/20 font-bold rounded-2xl transition-all duration-200 text-sm"
            >
              Xem các bản dịch
            </Link>
          </div>
        </div>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Stat 1 */}
        <div className="bg-white border border-slate-100 rounded-3xl p-6 flex items-center gap-4 shadow-sm shadow-slate-100/50 hover:shadow-md transition-all">
          <div className="p-3.5 bg-red-50 text-red-500 rounded-2xl shrink-0">
            <FileAudio size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tệp tin đã tải lên</p>
            <h3 className="text-2xl font-black text-slate-800 mt-1">
              {loading ? "..." : `${stats.filesCount} tệp`}
            </h3>
            <span className="text-[10px] text-slate-400 font-bold block mt-1">Lưu trữ trên MinIO Cloud</span>
          </div>
        </div>

        {/* Stat 2 */}
        <div className="bg-white border border-slate-100 rounded-3xl p-6 flex items-center gap-4 shadow-sm shadow-slate-100/50 hover:shadow-md transition-all">
          <div className="p-3.5 bg-indigo-50 text-indigo-500 rounded-2xl shrink-0">
            <FileText size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Văn bản dịch AI</p>
            <h3 className="text-2xl font-black text-slate-800 mt-1">
              {loading ? "..." : `${stats.transcriptsCount} bản dịch`}
            </h3>
            <span className="text-[10px] text-slate-400 font-bold block mt-1">Chuyển đổi qua Kafka & Gemini</span>
          </div>
        </div>

        {/* Stat 3 */}
        <div className="bg-white border border-slate-100 rounded-3xl p-6 flex items-center gap-4 shadow-sm shadow-slate-100/50 hover:shadow-md transition-all">
          <div className="p-3.5 bg-amber-50 text-amber-500 rounded-2xl shrink-0">
            <Activity size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Trạng thái tài khoản</p>
            <h3 className="text-2xl font-black text-slate-800 mt-1 capitalize">
              {user?.role?.toLowerCase() || "Thành viên"}
            </h3>
            <span className="text-[10px] text-slate-400 font-bold block mt-1">Quyền: {user?.permissions?.length || 0} scope</span>
          </div>
        </div>
      </div>

      {/* Feature Navigation Cards */}
      <div className="space-y-4">
        <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider pl-1">Chức năng chính</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Card 1 */}
          <Link
            href="/files"
            className="group bg-white border border-slate-100 rounded-3xl p-6 shadow-sm hover:shadow-md transition-all duration-200 space-y-4 text-left"
          >
            <div className="w-12 h-12 bg-red-50 text-red-500 group-hover:bg-red-500 group-hover:text-white rounded-2xl flex items-center justify-center transition-all duration-300">
              <FileAudio size={22} />
            </div>
            <div>
              <h4 className="font-extrabold text-slate-800 text-sm group-hover:text-red-500 transition-colors">Kho tệp tin âm thanh</h4>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">Tải lên các tệp audio dung lượng lớn, nghe phát trực tuyến chất lượng cao.</p>
            </div>
          </Link>

          {/* Card 2 */}
          <Link
            href="/transcripts"
            className="group bg-white border border-slate-100 rounded-3xl p-6 shadow-sm hover:shadow-md transition-all duration-200 space-y-4 text-left"
          >
            <div className="w-12 h-12 bg-indigo-50 text-indigo-500 group-hover:bg-indigo-500 group-hover:text-white rounded-2xl flex items-center justify-center transition-all duration-300">
              <FileText size={22} />
            </div>
            <div>
              <h4 className="font-extrabold text-slate-800 text-sm group-hover:text-indigo-600 transition-colors">Xem & Tìm kiếm bản dịch</h4>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">Tìm kiếm từ khóa hội thoại, phát đồng bộ theo dòng thời gian âm thanh.</p>
            </div>
          </Link>

          {/* Card 3 (Conditional) */}
          {hasPermission("read_users") && (
            <Link
              href="/users"
              className="group bg-white border border-slate-100 rounded-3xl p-6 shadow-sm hover:shadow-md transition-all duration-200 space-y-4 text-left"
            >
              <div className="w-12 h-12 bg-blue-50 text-blue-500 group-hover:bg-blue-500 group-hover:text-white rounded-2xl flex items-center justify-center transition-all duration-300">
                <Users size={22} />
              </div>
              <div>
                <h4 className="font-extrabold text-slate-800 text-sm group-hover:text-blue-600 transition-colors">Quản trị Thành viên</h4>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">Phân quyền, chỉnh sửa hồ sơ thông tin và vai trò của các tài khoản hệ thống.</p>
              </div>
            </Link>
          )}

          {/* Card 4 (Conditional) */}
          {hasPermission("manage_roles") && (
            <Link
              href="/roles"
              className="group bg-white border border-slate-100 rounded-3xl p-6 shadow-sm hover:shadow-md transition-all duration-200 space-y-4 text-left"
            >
              <div className="w-12 h-12 bg-amber-50 text-amber-500 group-hover:bg-amber-500 group-hover:text-white rounded-2xl flex items-center justify-center transition-all duration-300">
                <Shield size={22} />
              </div>
              <div>
                <h4 className="font-extrabold text-slate-800 text-sm group-hover:text-amber-600 transition-colors">Vai trò & Phân quyền</h4>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">Tạo vai trò mới, gán chi tiết phạm vi quyền hạn (read_users, manage_roles, ...)</p>
              </div>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
