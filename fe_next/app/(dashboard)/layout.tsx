"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, LayoutDashboard, LogOut, Settings, Bell, Search, Shield, FileAudio, FileText, Video, PanelLeftClose, PanelLeft } from "lucide-react";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, hasPermission } = useAuth();
  const pathname = usePathname();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const menuItems = [
    {
      name: "Trang chủ",
      href: "/home",
      icon: LayoutDashboard,
    },
    {
      name: "Quản lý thành viên",
      href: "/users",
      icon: Users,
      permission: "read_users",
    },
    {
      name: "Vai trò & Quyền",
      href: "/roles",
      icon: Shield,
      permission: "manage_roles",
    },
    {
      name: "Quản lý File",
      href: "/files",
      icon: FileAudio,
    },
    {
      name: "Quản lý Bản Dịch",
      href: "/transcripts",
      icon: FileText,
    },
    {
      name: "Quản lý Cuộc họp",
      href: "/meetings",
      icon: Video,
    },
  ];

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-800">
      {/* Left Sidebar - Styled like Wheelzie */}
      <aside className={`border-r border-slate-100 bg-white flex flex-col justify-between shrink-0 transition-all duration-300 ${isSidebarOpen ? "w-64" : "w-0 overflow-hidden"}`}>
        <div className="p-6 min-w-64">
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
              if (item.permission && !hasPermission(item.permission)) {
                return null;
              }
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
                href="/system"
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl font-bold text-sm transition-all ${
                  pathname.startsWith("/system")
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
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header - Styled like Wheelzie */}
        <header className="h-20 bg-white border-b border-slate-100 flex justify-between items-center px-10 shrink-0">
          {/* Left: Toggle Sidebar + Search Box */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => { setIsSidebarOpen(!isSidebarOpen); window.dispatchEvent(new Event("sidebar-toggle")); }}
              className="p-2.5 hover:bg-slate-50 text-slate-400 hover:text-slate-700 rounded-xl transition-all cursor-pointer"
              title={isSidebarOpen ? "Đóng sidebar" : "Mở sidebar"}
            >
              {isSidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
            </button>

            <div className="relative w-80">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Tìm kiếm..."
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-2 pl-11 pr-4 text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:border-red-500 focus:bg-white transition-all"
              />
            </div>
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

            {/* Profile Avatar and Name with Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex items-center gap-3 hover:bg-slate-50 p-1.5 rounded-2xl transition-all cursor-pointer text-left focus:outline-none"
              >
                <div className="text-right">
                  <p className="text-sm font-extrabold text-slate-800 leading-tight">{user?.name}</p>
                  <p className="text-xs text-slate-400 capitalize">{user?.role?.toLowerCase()}</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center font-bold text-slate-600 capitalize">
                  {user?.name?.[0] ?? "U"}
                </div>
              </button>

              {isDropdownOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-100 rounded-2xl shadow-xl py-1 z-50 origin-top-right transition-all">
                  <button
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    className="w-full flex items-center gap-2.5 px-4 py-3 text-xs font-bold text-red-500 hover:bg-red-50 transition-all cursor-pointer text-left"
                  >
                    <LogOut size={14} />
                    <span>Đăng xuất</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Content body */}
        <main className="flex-1 p-10 overflow-y-auto" data-transcript-content>
          {children}
        </main>
      </div>
    </div>
  );
}
