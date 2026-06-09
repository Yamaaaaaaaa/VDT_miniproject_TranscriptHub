'use client';

import React, { createContext, useContext, useState } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';

interface DashboardContextType {
  searchQuery: string;
}

const DashboardContext = createContext<DashboardContextType>({ searchQuery: '' });

export const useDashboardSearch = () => useContext(DashboardContext);

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [globalSearch, setGlobalSearch] = useState<string>('');

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  return (
    <ProtectedRoute>
      <DashboardContext.Provider value={{ searchQuery: globalSearch }}>
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
              {children}
            </main>
          </div>
        </div>
      </DashboardContext.Provider>
    </ProtectedRoute>
  );
}
