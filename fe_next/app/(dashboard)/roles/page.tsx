"use client";

import { useState, useEffect, useCallback } from "react";
import { rolesApi, permissionsApi } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import ConfirmModal from "@/components/confirm-modal";
import { PermissionGuard } from "@/components/permission-guard";
import {
  Plus, Edit2, Trash2, Shield, ShieldAlert, X, ShieldCheck, CheckSquare, Info, Lock
} from "lucide-react";

export default function RolesManagementPage() {
  const { hasPermission } = useAuth();
  
  // States for data
  const [roles, setRoles] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Reusable Confirm Modal State
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isDanger?: boolean;
    isAlert?: boolean;
    type?: 'warning' | 'success' | 'info' | 'error';
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
    isDanger: false,
    isAlert: false,
    type: 'warning',
  });

  const triggerConfirm = (title: string, message: string, onConfirm: () => void, isDanger = false) => {
    setConfirmState({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        onConfirm();
        setConfirmState(prev => ({ ...prev, isOpen: false }));
      },
      isDanger,
      isAlert: false,
      type: isDanger ? 'error' : 'warning',
    });
  };

  const triggerAlert = (title: string, message: string, type: 'success' | 'error' | 'info' | 'warning' = 'success') => {
    setConfirmState({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        setConfirmState(prev => ({ ...prev, isOpen: false }));
      },
      isDanger: type === 'error',
      isAlert: true,
      type,
    });
  };

  // States for modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPermissionsModalOpen, setIsPermissionsModalOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<any | null>(null);

  // Form states
  const [roleName, setRoleName] = useState("");
  const [selectedPermissionNames, setSelectedPermissionNames] = useState<string[]>([]);

  // Tải danh sách roles
  const loadRoles = useCallback(async () => {
    try {
      const data = await rolesApi.getAll();
      setRoles(data);
    } catch {
      console.error("Không thể tải danh sách vai trò.");
    }
  }, []);

  // Tải danh sách permissions
  const loadPermissions = useCallback(async () => {
    try {
      const data = await permissionsApi.getAll();
      setPermissions(data);
    } catch {
      console.error("Không thể tải danh sách quyền.");
    }
  }, []);

  // Khởi tạo tải dữ liệu
  useEffect(() => {
    const initData = async () => {
      setLoading(true);
      await Promise.all([loadRoles(), loadPermissions()]);
      setLoading(false);
    };
    initData();
  }, [loadRoles, loadPermissions]);

  // Tạo mới vai trò
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleName.trim()) return;

    try {
      // Tên vai trò nên được lưu ở dạng chữ in hoa
      const normalizedName = roleName.trim().toUpperCase();
      await rolesApi.create(normalizedName);
      triggerAlert("Thành công", "Tạo vai trò mới thành công!", "success");
      setRoleName("");
      setIsCreateModalOpen(false);
      loadRoles();
    } catch (err: any) {
      triggerAlert("Lỗi", err.response?.data?.message ?? "Không thể tạo vai trò mới.", "error");
    }
  };

  // Cập nhật tên vai trò
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRole || !roleName.trim()) return;

    try {
      const normalizedName = roleName.trim().toUpperCase();
      await rolesApi.update(selectedRole.id, normalizedName);
      triggerAlert("Thành công", "Cập nhật vai trò thành công!", "success");
      setRoleName("");
      setIsEditModalOpen(false);
      loadRoles();
    } catch (err: any) {
      triggerAlert("Lỗi", err.response?.data?.message ?? "Cập nhật vai trò thất bại.", "error");
    }
  };

  // Xóa vai trò
  const handleDeleteRole = (role: any) => {
    // Không cho xóa ADMIN/USER mặc định để bảo mật hệ thống
    if (role.name === "ADMIN" || role.name === "USER") {
      triggerAlert("Không hợp lệ", "Không thể xóa các vai trò hệ thống mặc định (ADMIN/USER).", "error");
      return;
    }

    triggerConfirm(
      "Xóa vai trò",
      `Bạn có chắc chắn muốn xóa vai trò "${role.name}" không?`,
      async () => {
        try {
          await rolesApi.remove(role.id);
          triggerAlert("Thành công", "Xóa vai trò thành công!", "success");
          loadRoles();
        } catch {
          triggerAlert("Lỗi", "Không thể xóa vai trò này.", "error");
        }
      },
      true
    );
  };

  // Mở modal sửa vai trò
  const openEditModal = (role: any) => {
    setSelectedRole(role);
    setRoleName(role.name);
    setIsEditModalOpen(true);
  };

  // Mở modal gán quyền hạn cho vai trò
  const openPermissionsModal = (role: any) => {
    setSelectedRole(role);
    // Trích xuất các permission name hiện có của role đó
    const currentPerms = role.permissions.map((p: any) => p.permission.name);
    setSelectedPermissionNames(currentPerms);
    setIsPermissionsModalOpen(true);
  };

  // Toggle chọn permission checkbox
  const handlePermissionCheckboxChange = (permName: string) => {
    setSelectedPermissionNames((prev) =>
      prev.includes(permName)
        ? prev.filter((p) => p !== permName)
        : [...prev, permName]
    );
  };

  // Submit cập nhật quyền hạn vai trò
  const handlePermissionsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRole) return;

    try {
      await rolesApi.updatePermissions(selectedRole.id, selectedPermissionNames);
      triggerAlert("Thành công", `Đã cập nhật quyền hạn cho vai trò "${selectedRole.name}"!`, "success");
      setIsPermissionsModalOpen(false);
      loadRoles();
    } catch {
      triggerAlert("Lỗi", "Cập nhật quyền hạn thất bại.", "error");
    }
  };

  // Group permissions để hiển thị đẹp theo từng danh mục
  const userPerms = permissions.filter((p) => p.name.includes("user"));
  const rolePerms = permissions.filter((p) => p.name.includes("role") || p.name.includes("permission"));
  const transcriptPerms = permissions.filter((p) => p.name.includes("transcript"));
  const otherPerms = permissions.filter(
    (p) => !userPerms.includes(p) && !rolePerms.includes(p) && !transcriptPerms.includes(p)
  );

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black text-slate-800">Quản lý vai trò & quyền hạn</h1>
          <p className="text-xs text-slate-400 mt-0.5">Quản lý phân loại vai trò (Roles) và gán quyền chi tiết (Permissions)</p>
        </div>

        <PermissionGuard permission="create_roles">
          <button
            onClick={() => {
              setRoleName("");
              setIsCreateModalOpen(true);
            }}
            className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-5 py-3 rounded-2xl font-bold text-sm shadow-lg shadow-red-500/20 transition-all cursor-pointer"
          >
            <Plus size={16} />
            <span>Thêm vai trò mới</span>
          </button>
        </PermissionGuard>
      </div>

      {/* Main card chứa danh sách CRUD Roles */}
      <div className="bg-white border border-slate-100 rounded-3xl shadow-sm shadow-slate-100/50 overflow-hidden">
        <div className="p-8 border-b border-slate-50">
          <h2 className="text-lg font-black text-slate-800">Danh sách các vai trò</h2>
          <p className="text-xs text-slate-400 mt-0.5">Roles hiện hành trong hệ thống và số lượng quyền hạn đi kèm</p>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm font-semibold">Đang tải dữ liệu vai trò...</div>
        ) : roles.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">Chưa có vai trò nào trong hệ thống.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-50 bg-slate-50/50 text-slate-400 text-xs font-bold uppercase tracking-wider">
                  <th className="p-5 pl-8">ID</th>
                  <th className="p-5">Tên vai trò (Role Name)</th>
                  <th className="p-5">Danh sách quyền hạn được gán (Permissions)</th>
                  <th className="p-5 pr-8 text-right">Hành động</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((role) => (
                  <tr key={role.id} className="border-b border-slate-50 hover:bg-slate-50/30 transition-colors">
                    {/* ID */}
                    <td className="p-5 pl-8 text-sm text-slate-400 font-bold">#{role.id}</td>

                    {/* Role Name badge */}
                    <td className="p-5 font-bold text-slate-800">
                      <div className="flex items-center gap-2">
                        <Shield size={16} className="text-slate-400" />
                        <span>{role.name}</span>
                        {(role.name === "ADMIN" || role.name === "USER") && (
                          <span className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-400 border border-slate-200 rounded-full font-bold uppercase">
                            System
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Permissions list / preview */}
                    <td className="p-5 text-sm font-medium text-slate-600 max-w-md">
                      <div className="flex flex-wrap gap-1.5">
                        {role.permissions && role.permissions.length > 0 ? (
                          role.permissions.map((p: any) => (
                            <span
                              key={p.permissionId}
                              className="text-[10px] px-2.5 py-0.5 bg-slate-50 text-slate-600 border border-slate-200 rounded-full font-semibold"
                            >
                              {p.permission.name}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-300 font-normal italic text-xs">Chưa có quyền nào</span>
                        )}
                      </div>
                    </td>

                    {/* Action buttons */}
                    <td className="p-5 pr-8 text-right space-x-1">
                      {/* Phân quyền */}
                      <PermissionGuard permission="update_role_permissions">
                        <button
                          onClick={() => openPermissionsModal(role)}
                          className="p-2.5 text-indigo-500 hover:bg-indigo-50 rounded-xl transition-all cursor-pointer inline-flex"
                          title="Gán quyền hạn"
                        >
                          <ShieldCheck size={16} />
                        </button>
                      </PermissionGuard>

                      {/* Sửa tên */}
                      <PermissionGuard permission="update_roles">
                        <button
                          onClick={() => openEditModal(role)}
                          className="p-2.5 text-yellow-600 hover:bg-yellow-50 rounded-xl transition-all cursor-pointer inline-flex"
                          title="Cập nhật tên vai trò"
                          disabled={role.name === "ADMIN" || role.name === "USER"}
                          style={{ opacity: (role.name === "ADMIN" || role.name === "USER") ? 0.3 : 1 }}
                        >
                          <Edit2 size={16} />
                        </button>
                      </PermissionGuard>

                      {/* Xóa vai trò */}
                      <PermissionGuard permission="delete_roles">
                        <button
                          onClick={() => handleDeleteRole(role)}
                          className="p-2.5 text-red-500 hover:bg-red-50 rounded-xl transition-all cursor-pointer inline-flex"
                          title="Xóa vai trò"
                          disabled={role.name === "ADMIN" || role.name === "USER"}
                          style={{ opacity: (role.name === "ADMIN" || role.name === "USER") ? 0.3 : 1 }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </PermissionGuard>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: TẠO MỚI VAI TRÒ */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm z-50 p-4">
          <div className="bg-white border border-slate-100 rounded-3xl w-full max-w-sm p-8 shadow-2xl space-y-5">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-black text-slate-800">Thêm vai trò mới</h3>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-50 rounded-xl transition-all cursor-pointer">
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Tên vai trò (Viết hoa, ví dụ: MANAGER)</label>
                <input
                  type="text"
                  required
                  placeholder="MANAGER"
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-red-500 focus:bg-white transition-all uppercase"
                  value={roleName}
                  onChange={(e) => setRoleName(e.target.value)}
                />
              </div>

              <button type="submit" className="w-full bg-red-500 hover:bg-red-600 py-3.5 rounded-2xl font-bold text-white shadow-lg shadow-red-500/10 transition-all cursor-pointer mt-2">
                Tạo vai trò
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal: SỬA TÊN VAI TRÒ */}
      {isEditModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm z-50 p-4">
          <div className="bg-white border border-slate-100 rounded-3xl w-full max-w-sm p-8 shadow-2xl space-y-5">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-black text-slate-800">Cập nhật tên vai trò</h3>
              <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-50 rounded-xl transition-all cursor-pointer">
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Tên vai trò mới</label>
                <input
                  type="text"
                  required
                  placeholder="SUPER_ADMIN"
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-red-500 focus:bg-white transition-all uppercase"
                  value={roleName}
                  onChange={(e) => setRoleName(e.target.value)}
                />
              </div>

              <button type="submit" className="w-full bg-red-500 hover:bg-red-600 py-3.5 rounded-2xl font-bold text-white shadow-lg shadow-red-500/10 transition-all cursor-pointer mt-2">
                Cập nhật
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal: GÁN QUYỀN HẠN CHO VAI TRÒ */}
      {isPermissionsModalOpen && selectedRole && (
        <div className="fixed inset-0 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm z-50 p-4">
          <div className="bg-white border border-slate-100 rounded-3xl w-full max-w-2xl p-8 shadow-2xl space-y-5 max-h-[85vh] flex flex-col">
            
            {/* Modal Header */}
            <div className="flex justify-between items-center shrink-0 border-b border-slate-50 pb-4">
              <div>
                <h3 className="text-base font-black text-slate-800">
                  Ghi nhận Quyền hạn cho vai trò: <span className="text-red-500">{selectedRole.name}</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">Tích chọn các permission cần phân quyền cho vai trò này</p>
              </div>
              <button onClick={() => setIsPermissionsModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-50 rounded-xl transition-all cursor-pointer">
                <X size={18} />
              </button>
            </div>

            {/* Warning if system default */}
            {(selectedRole.name === "ADMIN") && (
              <div className="bg-amber-50 border border-amber-100 text-amber-600 p-4 rounded-2xl text-[11px] font-medium flex gap-2 shrink-0">
                <Info size={16} className="shrink-0 text-amber-500" />
                <span>Bạn đang sửa quyền của vai trò quản trị hệ thống <b>ADMIN</b>. Hãy thực sự cẩn trọng khi gỡ bớt quyền!</span>
              </div>
            )}

            {/* Scrollable Checkbox List */}
            <form onSubmit={handlePermissionsSubmit} className="flex-1 overflow-y-auto space-y-6 py-2 pr-2">
              
              {/* Category: Quản lý Member */}
              {userPerms.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-indigo-500 uppercase tracking-wider">Quản lý Thành viên (Users)</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {userPerms.map((perm) => (
                      <label key={perm.id} className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-100 hover:border-slate-200 rounded-xl cursor-pointer select-none transition-all">
                        <input
                          type="checkbox"
                          className="rounded border-slate-300 text-red-500 focus:ring-red-500"
                          checked={selectedPermissionNames.includes(perm.name)}
                          onChange={() => handlePermissionCheckboxChange(perm.name)}
                        />
                        <span className="text-xs font-bold text-slate-700">{perm.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Category: Quản lý Bản ghi ghi âm */}
              {transcriptPerms.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-blue-500 uppercase tracking-wider">Quản lý Bản dịch (Transcripts)</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {transcriptPerms.map((perm) => (
                      <label key={perm.id} className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-100 hover:border-slate-200 rounded-xl cursor-pointer select-none transition-all">
                        <input
                          type="checkbox"
                          className="rounded border-slate-300 text-red-500 focus:ring-red-500"
                          checked={selectedPermissionNames.includes(perm.name)}
                          onChange={() => handlePermissionCheckboxChange(perm.name)}
                        />
                        <span className="text-xs font-bold text-slate-700">{perm.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Category: Thiết lập Vai trò / Phân quyền */}
              {rolePerms.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-purple-500 uppercase tracking-wider">Vai trò & Quyền hạn (RBAC)</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {rolePerms.map((perm) => (
                      <label key={perm.id} className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-100 hover:border-slate-200 rounded-xl cursor-pointer select-none transition-all">
                        <input
                          type="checkbox"
                          className="rounded border-slate-300 text-red-500 focus:ring-red-500"
                          checked={selectedPermissionNames.includes(perm.name)}
                          onChange={() => handlePermissionCheckboxChange(perm.name)}
                        />
                        <span className="text-xs font-bold text-slate-700">{perm.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Other Permissions */}
              {otherPerms.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Quyền hạn khác</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {otherPerms.map((perm) => (
                      <label key={perm.id} className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-100 hover:border-slate-200 rounded-xl cursor-pointer select-none transition-all">
                        <input
                          type="checkbox"
                          className="rounded border-slate-300 text-red-500 focus:ring-red-500"
                          checked={selectedPermissionNames.includes(perm.name)}
                          onChange={() => handlePermissionCheckboxChange(perm.name)}
                        />
                        <span className="text-xs font-bold text-slate-700">{perm.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </form>

            {/* Modal Actions */}
            <div className="shrink-0 border-t border-slate-50 pt-4 flex gap-3">
              <button
                type="button"
                onClick={() => setIsPermissionsModalOpen(false)}
                className="w-1/3 border border-slate-200 hover:bg-slate-50 py-3 rounded-2xl font-bold text-sm text-slate-600 transition-all cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handlePermissionsSubmit}
                className="w-2/3 bg-indigo-600 hover:bg-indigo-500 py-3 rounded-2xl font-bold text-sm text-white shadow-lg shadow-indigo-600/10 transition-all cursor-pointer"
              >
                Cập nhật quyền hạn
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Reusable Confirm Modal */}
      <ConfirmModal
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
        isDanger={confirmState.isDanger}
        isAlert={confirmState.isAlert}
        type={confirmState.type}
      />
    </div>
  );
}
