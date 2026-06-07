import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api, type RoleResponse } from '../services/api';
import { Info, ShieldAlert, Key, RefreshCw } from 'lucide-react';

interface OutletContextType {
  searchQuery: string;
}

export const RoleManagement = () => {
  const { searchQuery } = useOutletContext<OutletContextType>();
  const [roles, setRoles] = useState<RoleResponse[]>([]);
  const [filteredRoles, setFilteredRoles] = useState<RoleResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const fetchRoles = async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    
    setError('');
    try {
      const data = await api.getAllRoles();
      setRoles(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Không thể tải danh sách vai trò từ hệ thống.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchRoles();
  }, []);

  useEffect(() => {
    if (!searchQuery) {
      setFilteredRoles(roles);
      return;
    }

    const query = searchQuery.toLowerCase().trim();
    const filtered = roles.filter(
      (r) =>
        r.name.toLowerCase().includes(query) ||
        r.description.toLowerCase().includes(query) ||
        (r.permissions &&
          r.permissions.some((p) => p.name.toLowerCase().includes(query)))
    );
    setFilteredRoles(filtered);
  }, [searchQuery, roles]);

  return (
    <div className="animate-fade-in">
      {/* Page Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 className="page-title">Quản lý vai trò (Roles)</h2>
          <p className="page-description">Xem danh mục phân quyền và cấu hình vai trò trên toàn hệ thống</p>
        </div>

        <button
          onClick={() => fetchRoles(true)}
          className="btn btn-secondary"
          disabled={loading || refreshing}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
          <span>Làm mới</span>
        </button>
      </div>

      {/* Read-only Alert Warning Banner */}
      <div className="alert alert-success" style={{
        backgroundColor: 'var(--info-light)',
        color: 'var(--info-color)',
        border: '1px solid rgba(6, 182, 212, 0.2)',
        marginBottom: '1.5rem',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.75rem',
        padding: '1rem'
      }}>
        <Info size={18} style={{ marginTop: '0.125rem', flexShrink: 0 }} />
        <div>
          <strong style={{ display: 'block', marginBottom: '0.25rem' }}>Giao diện Xem vai trò (Chế độ Chỉ đọc)</strong>
          <span style={{ fontSize: '0.85rem' }}>
            Hệ thống phân quyền được cấu hình tĩnh từ phía Server. Mọi thao tác thêm mới, chỉnh sửa cấu trúc hoặc xóa vai trò bị hạn chế trên giao diện quản trị này để bảo vệ tính ổn định của hệ thống.
          </span>
        </div>
      </div>

      {loading ? (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '4rem 2rem',
          backgroundColor: 'var(--bg-card)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-color)',
          gap: '1rem'
        }}>
          <div className="spin-loader" />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Đang tải danh sách vai trò...</span>
        </div>
      ) : error ? (
        <div style={{
          padding: '2rem',
          backgroundColor: 'var(--danger-light)',
          color: 'var(--danger-color)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          borderRadius: 'var(--radius-lg)',
          textAlign: 'center'
        }}>
          <p style={{ fontWeight: 600 }}>Lỗi xảy ra:</p>
          <p style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>{error}</p>
          <button onClick={() => fetchRoles()} className="btn btn-danger" style={{ marginTop: '1rem' }}>Thử lại</button>
        </div>
      ) : (
        <div className="table-container">
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '25%' }}>Tên Vai Trò</th>
                  <th style={{ width: '40%' }}>Mô Tả Chi Tiết</th>
                  <th style={{ width: '35%' }}>Danh Sách Quyền Hạn</th>
                </tr>
              </thead>
              <tbody>
                {filteredRoles.length === 0 ? (
                  <tr>
                    <td colSpan={3}>
                      <div className="table-empty">
                        <ShieldAlert className="table-empty-icon" />
                        <h4 className="table-empty-title">Không tìm thấy vai trò nào</h4>
                        <p className="table-empty-desc">
                          {searchQuery ? 'Không có vai trò nào khớp với từ khóa tìm kiếm của bạn.' : 'Danh mục vai trò trống.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredRoles.map((role) => {
                    const isSystemAdmin = role.name === 'ADMIN' || role.name === 'ADMIN_LOGIN';
                    return (
                      <tr key={role.name}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span className={`badge ${isSystemAdmin ? 'badge-admin' : 'badge-user'}`} style={{
                              fontSize: '0.875rem',
                              padding: '0.25rem 0.625rem'
                            }}>
                              {role.name}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>{role.description}</span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                            {role.permissions && role.permissions.length > 0 ? (
                              role.permissions.map((perm) => (
                                <span
                                  key={perm.name}
                                  title={perm.description}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                    backgroundColor: 'var(--bg-main)',
                                    color: 'var(--text-muted)',
                                    fontSize: '0.75rem',
                                    padding: '0.125rem 0.5rem',
                                    borderRadius: 'var(--radius-sm)',
                                    border: '1px solid var(--border-color)'
                                  }}
                                >
                                  <Key size={10} />
                                  {perm.name}
                                </span>
                              ))
                            ) : (
                              <span className="text-muted" style={{ fontStyle: 'italic', fontSize: '0.75rem' }}>
                                Không có quyền đặc biệt
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CSS Utility for spinner and layout animations */}
      <style>{`
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .spin-loader {
          width: 30px;
          height: 30px;
          border: 3px solid var(--border-color);
          border-top-color: var(--primary-color);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
      `}</style>
    </div>
  );
};
export default RoleManagement;
