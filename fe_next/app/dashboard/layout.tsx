"use client";

import { useAuth } from "@/hooks/use-auth";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, LayoutDashboard, LogOut, Settings, Bell, Search } from "lucide-react";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, hasPermission } = useAuth();
  const pathname = usePathname();

  const menuItems = [
    {
      name: "Quản lý thành viên",
      href: "/dashboard/users",
      icon: Users,
      permission: "read_users",
    },
  ];

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-800">
      {/* Left Sidebar - Styled like Wheelzie */}
      <aside className="w-64 border-r border-slate-100 bg-white flex flex-col justify-between shrink-0">
        <div className="p-6">
          {/* Logo Brand */}
          <div className="flex items-center gap-2 mb-8">
            <div className="w-8 h-8 rounded-full border-[5px] border-red-500 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-red-500" />
            </div>
            <span className="text-xl font-black text-slate-800 tracking-tight">TranscriptHub</span>
            <span className="text-[10px] px-1.5 py-0.5 bg-red-50 text-red-500 border border-red-100 rounded-full font-bold ml-1">
              v1.0
            </span>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1.5">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-2xl font-bold text-sm transition-all ${
                    isActive
                      ? "bg-slate-50 text-red-500 shadow-sm border-l-4 border-red-500 pl-3"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                  }`}
                >
                  <Icon size={18} className={isActive ? "text-red-500" : "text-slate-400"} />
                  <span>{item.name}</span>
                </Link>
              );
            })}

            {hasPermission("manage_system") && (
              <Link
                href="/dashboard/system"
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl font-bold text-sm transition-all ${
                  pathname.startsWith("/dashboard/system")
                    ? "bg-slate-50 text-red-500 shadow-sm border-l-4 border-red-500 pl-3"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                }`}
              >
                <Settings size={18} className="text-slate-400" />
                <span>Cấu hình hệ thống</span>
              </Link>
            )}
          </nav>
        </div>

        {/* Sidebar Footer User Section */}
        <div className="p-6 border-t border-slate-100 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-50 border border-red-100 flex items-center justify-center font-bold text-red-500 uppercase">
              {user?.name?.[0] ?? "U"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-800 truncate leading-tight">{user?.name}</p>
              <span className="inline-block text-[9px] px-2 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 rounded-full font-bold uppercase mt-1">
                {user?.role}
              </span>
            </div>
          </div>

          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-red-500 hover:bg-red-50 rounded-2xl border border-transparent hover:border-red-100 transition-all cursor-pointer"
          >
            <LogOut size={16} />
            <span>Đăng xuất</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header - Styled like Wheelzie */}
        <header className="h-20 bg-white border-b border-slate-100 flex justify-between items-center px-10 shrink-0">
          {/* Left: Search Box */}
          <div className="relative w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Tìm kiếm..."
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-2 pl-11 pr-4 text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:border-red-500 focus:bg-white transition-all"
            />
          </div>

          {/* Right: Quick actions, Notifications, Profile avatar */}
          <div className="flex items-center gap-6">
            {/* Action Buttons */}
            <div className="flex items-center gap-3 text-slate-400">
              <button className="p-2.5 hover:bg-slate-50 hover:text-slate-700 rounded-xl transition-all relative">
                <Bell size={18} />
                <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full" />
              </button>
              <button className="p-2.5 hover:bg-slate-50 hover:text-slate-700 rounded-xl transition-all">
                <Settings size={18} />
              </button>
            </div>

            {/* Vertical Separator */}
            <div className="w-px h-6 bg-slate-200" />

            {/* Profile Avatar and Name */}
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-extrabold text-slate-800 leading-tight">{user?.name}</p>
                <p className="text-xs text-slate-400 capitalize">{user?.role?.toLowerCase()}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center font-bold text-slate-600 capitalize">
                {user?.name?.[0] ?? "U"}
              </div>
            </div>
          </div>
        </header>

        {/* Content body */}
        <main className="flex-1 p-10 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
