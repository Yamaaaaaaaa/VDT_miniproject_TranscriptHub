import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

export const MainLayout = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [globalSearch, setGlobalSearch] = useState<string>('');

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  return (
    <div className="app-container">
      {/* Sidebar navigation */}
      <Sidebar collapsed={sidebarCollapsed} />

      {/* Main viewport area */}
      <div className={`main-wrapper ${sidebarCollapsed ? 'full-width' : ''}`}>
        
        {/* Top Header navbar */}
        <Header 
          onToggleSidebar={toggleSidebar} 
          collapsed={sidebarCollapsed}
          searchQuery={globalSearch}
          onSearchChange={setGlobalSearch}
        />

        {/* Dynamic page content container */}
        <main className="main-content">
          {/* We can pass global search query state using react-router-dom context if children need it */}
          <Outlet context={{ searchQuery: globalSearch }} />
        </main>
      </div>
    </div>
  );
};
export default MainLayout;
