'use client';

import { Menu, Search } from 'lucide-react';

interface HeaderProps {
  onToggleSidebar: () => void;
  collapsed: boolean;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
}

export const Header = ({
  onToggleSidebar,
  searchQuery = '',
  onSearchChange
}: HeaderProps) => {
  return (
    <header className="header">
      {/* Search and Toggle Button */}
      <div className="header-left">
        <button 
          onClick={onToggleSidebar} 
          className="sidebar-toggle"
          title="Thu gọn / Mở rộng"
        >
          <Menu size={20} />
        </button>
        
        <div className="search-container">
          <Search className="search-icon" />
          <input 
            type="text" 
            placeholder="Tìm kiếm người dùng, cuộc họp, tài liệu..." 
            value={searchQuery}
            onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
            className="search-input"
          />
        </div>
      </div>
    </header>
  );
};

export default Header;
