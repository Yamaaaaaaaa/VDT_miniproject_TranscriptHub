'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { 
  LayoutDashboard, 
  Users, 
  Settings, 
  LogOut, 
  Video, 
  FileText,
  ShieldAlert,
  HardDrive
} from 'lucide-react';

interface SidebarProps {
  collapsed: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ collapsed }) => {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  // Get user avatar initials
  const getInitials = () => {
    if (!user) return 'U';
    const name = user.username || user.email;
    return name.slice(0, 2).toUpperCase();
  };

  const isAdmin = user?.roles?.some(role => role === 'ADMIN' || role === 'ADMIN_LOGIN');

  const isActive = (href: string, exact = false) => {
    if (exact) return pathname === href;
    return pathname === href || (href !== '/' && pathname.startsWith(href));
  };

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      {/* Brand Logo Header */}
      <div className="sidebar-brand">
        <h1 className="sidebar-title">TranscriptHub</h1>
        <span className="sidebar-subtitle">Hệ Thống Quản Trị</span>
      </div>

      {/* Navigation List */}
      <nav className="sidebar-nav">
        <div className="sidebar-group">
          <span className="sidebar-group-title">Navigation</span>
          
          <Link 
            href="/" 
            className={`sidebar-item ${isActive('/', true) ? 'active' : ''}`}
          >
            <LayoutDashboard className="sidebar-icon" />
            <span>Tổng quan</span>
          </Link>

          <Link 
            href="/users" 
            className={`sidebar-item ${isActive('/users') ? 'active' : ''}`}
          >
            <Users className="sidebar-icon" />
            <span>Quản lý người dùng</span>
          </Link>

          <Link 
            href="/roles" 
            className={`sidebar-item ${isActive('/roles') ? 'active' : ''}`}
          >
            <ShieldAlert className="sidebar-icon" />
            <span>Quản lý vai trò</span>
          </Link>

          <Link 
            href="/files" 
            className={`sidebar-item ${isActive('/files') ? 'active' : ''}`}
          >
            <HardDrive className="sidebar-icon" />
            <span>Quản lý File</span>
          </Link>

          <Link 
            href="/scripts" 
            className={`sidebar-item ${isActive('/scripts') ? 'active' : ''}`}
          >
            <FileText className="sidebar-icon" />
            <span>Quản lý Script</span>
          </Link>

          <Link 
            href="/meetings" 
            className={`sidebar-item ${isActive('/meetings') ? 'active' : ''}`}
          >
            <Video className="sidebar-icon" />
            <span>Quản lý cuộc họp</span>
          </Link>
        </div>

        <div className="sidebar-group">
          <span className="sidebar-group-title">Settings</span>
          
          <div className="sidebar-item" style={{ opacity: 0.5, cursor: 'not-allowed' }}>
            <Settings className="sidebar-icon" />
            <span>Cấu hình</span>
          </div>
        </div>
      </nav>

      {/* User Info Footer Section */}
      {user && (
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className={`sidebar-user-avatar ${isAdmin ? 'admin-avatar' : ''}`} style={{
              backgroundColor: isAdmin ? 'var(--danger-light)' : 'var(--primary-color)',
              color: isAdmin ? 'var(--danger-color)' : 'white'
            }}>
              {getInitials()}
            </div>
            <div className="sidebar-user-info">
              <span className="sidebar-user-name" title={user.username}>{user.username}</span>
              <span className="sidebar-user-role" title={user.email}>
                {isAdmin ? 'Quản trị viên' : 'Thành viên'}
              </span>
            </div>
          </div>
          
          <button 
            onClick={logout} 
            className="btn-logout" 
            title="Đăng xuất"
          >
            <LogOut size={18} />
          </button>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
