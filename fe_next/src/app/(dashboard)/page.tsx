'use client';

import React from 'react';
import { useAuth } from '@/context/AuthContext';
import { Users, Video, Award, AlertTriangle, TrendingUp } from 'lucide-react';

export default function DashboardOverview() {
  const { user } = useAuth();

  return (
    <div className="animate-fade-in">
      {/* Page Header */}
      <div className="page-header">
        <h2 className="page-title">Dashboard Overview</h2>
        <p className="page-description">Comprehensive view of system statistics, user actions, and transcription metrics</p>
      </div>

      {/* Stats Cards Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '1.5rem',
        marginBottom: '2rem'
      }}>
        {/* Card 1 */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)' }}>Total Users</span>
            <div style={{ padding: '0.375rem', borderRadius: 'var(--radius-md)', backgroundColor: '#eff6ff', color: 'var(--primary-color)' }}>
              <Users size={18} />
            </div>
          </div>
          <span style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '0.5rem' }}>250</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--success-color)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <TrendingUp size={12} />
            <strong>+12%</strong> from last month
          </span>
        </div>

        {/* Card 2 */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)' }}>Average Transcripts</span>
            <div style={{ padding: '0.375rem', borderRadius: 'var(--radius-md)', backgroundColor: '#ecfeff', color: 'var(--info-color)' }}>
              <Video size={18} />
            </div>
          </div>
          <span style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '0.5rem' }}>67</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--success-color)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <TrendingUp size={12} />
            <strong>+3.2%</strong> from last week
          </span>
        </div>

        {/* Card 3 */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)' }}>Top Accuracy</span>
            <div style={{ padding: '0.375rem', borderRadius: 'var(--radius-md)', backgroundColor: '#fefce8', color: 'var(--warning-color)' }}>
              <Award size={18} />
            </div>
          </div>
          <span style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '0.5rem' }}>98.2%</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Score above 95%</span>
        </div>

        {/* Card 4 */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)' }}>Flagged Cases</span>
            <div style={{ padding: '0.375rem', borderRadius: 'var(--radius-md)', backgroundColor: '#fef2f2', color: 'var(--danger-color)' }}>
              <AlertTriangle size={18} />
            </div>
          </div>
          <span style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--danger-color)', marginTop: '0.5rem' }}>16</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Requires review</span>
        </div>
      </div>

      {/* Visual Graphs Section */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
        gap: '1.5rem',
        marginBottom: '2rem'
      }}>
        {/* Bar Chart Card */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)' }}>Regional Performance</h3>
          <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '2rem' }}>Average scores by region</span>
          
          <div style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            height: '220px',
            paddingBottom: '1rem',
            borderBottom: '1px solid var(--border-color)',
            gap: '0.5rem'
          }}>
            {/* Bar 1 */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: '0.5rem' }}>
              <div style={{ height: '180px', width: '100%', backgroundColor: 'var(--primary-color)', borderRadius: '4px 4px 0 0' }} />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', transform: 'rotate(-45deg)', marginTop: '0.5rem', whiteSpace: 'nowrap' }}>Kolkata</span>
            </div>
            {/* Bar 2 */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: '0.5rem' }}>
              <div style={{ height: '172px', width: '100%', backgroundColor: 'var(--primary-color)', borderRadius: '4px 4px 0 0' }} />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', transform: 'rotate(-45deg)', marginTop: '0.5rem', whiteSpace: 'nowrap' }}>Chandigarh</span>
            </div>
            {/* Bar 3 */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: '0.5rem' }}>
              <div style={{ height: '170px', width: '100%', backgroundColor: 'var(--primary-color)', borderRadius: '4px 4px 0 0' }} />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', transform: 'rotate(-45deg)', marginTop: '0.5rem', whiteSpace: 'nowrap' }}>Bhopal</span>
            </div>
            {/* Bar 4 */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: '0.5rem' }}>
              <div style={{ height: '160px', width: '100%', backgroundColor: 'var(--primary-color)', borderRadius: '4px 4px 0 0' }} />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', transform: 'rotate(-45deg)', marginTop: '0.5rem', whiteSpace: 'nowrap' }}>Mumbai</span>
            </div>
            {/* Bar 5 */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: '0.5rem' }}>
              <div style={{ height: '162px', width: '100%', backgroundColor: 'var(--primary-color)', borderRadius: '4px 4px 0 0' }} />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', transform: 'rotate(-45deg)', marginTop: '0.5rem', whiteSpace: 'nowrap' }}>Chennai</span>
            </div>
            {/* Bar 6 */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: '0.5rem' }}>
              <div style={{ height: '158px', width: '100%', backgroundColor: 'var(--primary-color)', borderRadius: '4px 4px 0 0' }} />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', transform: 'rotate(-45deg)', marginTop: '0.5rem', whiteSpace: 'nowrap' }}>Lucknow</span>
            </div>
            {/* Bar 7 */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: '0.5rem' }}>
              <div style={{ height: '150px', width: '100%', backgroundColor: 'var(--primary-color)', borderRadius: '4px 4px 0 0' }} />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', transform: 'rotate(-45deg)', marginTop: '0.5rem', whiteSpace: 'nowrap' }}>Pune</span>
            </div>
          </div>
          <div style={{ height: '2.5rem' }} /> {/* Spacing for rotated text */}
        </div>

        {/* Circular / Pie Chart Card */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)' }}>Sport Distribution</h3>
          <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>Number of athletes by sport</span>
          
          <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', gap: '2rem' }}>
            {/* Pie Chart render via conic-gradient CSS */}
            <div style={{
              width: '160px',
              height: '160px',
              borderRadius: '50%',
              background: 'conic-gradient(var(--primary-color) 0% 23%, #06b6d4 23% 39%, #a855f7 39% 56%, #1d4ed8 56% 73%, #3b82f6 73% 85%, #93c5fd 85% 100%)',
              boxShadow: 'inset 0 0 0 10px white, var(--shadow-sm)',
              position: 'relative',
              flexShrink: 0
            }} />

            {/* Chart Legend */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: 'var(--primary-color)' }} />
                <span>Swimming 23%</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: '#06b6d4' }} />
                <span>Athletics 16%</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: '#a855f7' }} />
                <span>Boxing 17%</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: '#1d4ed8' }} />
                <span>Wrestling 17%</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: '#3b82f6' }} />
                <span>Weightlifting 12%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Welcome Banner */}
      <div className="card" style={{
        background: 'linear-gradient(90deg, var(--primary-light) 0%, rgba(255, 255, 255, 0) 100%)',
        borderLeft: '4px solid var(--primary-color)',
        padding: '1.25rem 1.5rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div>
          <h4 style={{ fontWeight: 700, color: 'var(--text-main)' }}>Chào mừng quay lại, {user?.username}!</h4>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.125rem' }}>
            Hệ thống của bạn đang hoạt động bình thường. Có 0 yêu cầu dịch thuật đang chờ xử lý.
          </p>
        </div>
        <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 600 }}>
          {new Date().toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </div>
    </div>
  );
}
