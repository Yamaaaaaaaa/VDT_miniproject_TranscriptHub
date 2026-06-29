"use client";

import { useState, useEffect, useCallback } from "react";
import { usersApi, rolesApi } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { PermissionGuard } from "@/components/permission-guard";
import ConfirmModal from "@/components/confirm-modal";
import { Plus, Edit2, Trash2, ShieldAlert, X, Users, Shield, UserCheck, ShieldCheck, Mail, Phone, Info } from "lucide-react";

export default function UsersManagementPage() {
  const { hasPermission, user } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
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
  
  // Trạng thái cho Modals
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);

  // Form states
  const [formData, setFormData] = useState({ name: "", phone: "", bio: "" });
  const [createFormData, setCreateFormData] = useState({ name: "", email: "", password: "", phone: "", bio: "" });
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);

  // Tải danh sách người dùng
  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await usersApi.getAll();
      setUsers(data);
    } catch {
      console.error("Không thể tải danh sách người dùng.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Tải danh sách vai trò
  const loadRoles = useCallback(async () => {
    try {
      const data = await rolesApi.getAll();
      setRoles(data);
    } catch {
      console.error("Không thể tải danh sách vai trò.");
    }
  }, []);

  useEffect(() => {
    loadUsers();
    loadRoles();
  }, [loadUsers, loadRoles]);


  // Xóa người dùng
  const handleDelete = (id: number) => {
    if (user && Number(user.id) === id) {
      triggerAlert("Không hợp lệ", "Bạn không thể tự xóa tài khoản của chính mình!", "error");
      return;
    }
    triggerConfirm(
      "Xóa thành viên",
      "Bạn có chắc chắn muốn xóa thành viên này không?",
      async () => {
        try {
          await usersApi.remove(id);
          triggerAlert("Thành công", "Xóa thành viên thành công!", "success");
          loadUsers();
        } catch {
          triggerAlert("Lỗi", "Xóa thất bại. Bạn không đủ quyền hạn.", "error");
        }
      },
      true
    );
  };

  // Mở modal tạo mới người dùng
  const openCreateModal = () => {
    setCreateFormData({ name: "", email: "", password: "", phone: "", bio: "" });
    setIsCreateModalOpen(true);
  };

  // Submit tạo mới người dùng
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const defaultPassword = createFormData.password || "123456";
      
      // 1. Đăng ký tài khoản ở Identity DB
      const registerRes = await usersApi.registerAccount({
        name: createFormData.name,
        email: createFormData.email,
        password: defaultPassword,
      });

      const newAccountId = registerRes?.account?.id;

      // 2. Cập nhật phone/bio ở Users DB nếu có nhập
      if (newAccountId && (createFormData.phone || createFormData.bio)) {
        await usersApi.update(newAccountId, {
          phone: createFormData.phone,
          bio: createFormData.bio,
        });
      }

      triggerAlert("Thành công", `Thêm thành viên thành công! Mật khẩu mặc định của tài khoản là: ${defaultPassword}`, "success");
      setIsCreateModalOpen(false);
      loadUsers();
    } catch (err: any) {
      triggerAlert("Lỗi", err.response?.data?.message ?? "Không thể tạo tài khoản mới.", "error");
    }
  };

  // Mở modal cập nhật thông tin hồ sơ
  const openEditModal = (user: any) => {
    setSelectedUser(user);
    setFormData({
      name: user.name || "",
      phone: user.phone || "",
      bio: user.bio || "",
    });
    setIsEditModalOpen(true);
  };

  // Submit cập nhật hồ sơ
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    try {
      await usersApi.update(selectedUser.id, formData);
      triggerAlert("Thành công", "Cập nhật hồ sơ thành công!", "success");
      setIsEditModalOpen(false);
      loadUsers();
    } catch {
      triggerAlert("Lỗi", "Không thể cập nhật hồ sơ.", "error");
    }
  };

  // Mở modal gán vai trò tài khoản (Chỉ admin có quyền)
  const openRoleModal = (user: any) => {
    setSelectedUser(user);
    setSelectedRoles(user.role ? [user.role] : []);
    setIsRoleModalOpen(true);
  };

  // Submit cập nhật vai trò (Role)
  const handleRoleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    try {
      await usersApi.updateUserRoles(selectedUser.id, selectedRoles);
      triggerAlert("Thành công", "Cập nhật vai trò người dùng thành công!", "success");
      setIsRoleModalOpen(false);
      loadUsers();
    } catch {
      triggerAlert("Lỗi", "Cập nhật vai trò thất bại.", "error");
    }
  };

  // Tính toán số liệu thống kê cho widget (lấy cảm hứng từ các widget trong image.png)
  const totalCount = users.length;
  const adminCount = users.filter(u => u.role === "ADMIN").length;
  const managerCount = users.filter(u => u.role === "MANAGER").length;
  const userCount = users.filter(u => u.role === "USER" || !u.role).length;

  return (
    <div className="space-y-8">
      {/* 4 Widget thống kê được thiết kế theo phong cách Wheelzie */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Widget 1 */}
        <div className="bg-white border border-slate-100 rounded-3xl p-6 flex items-center gap-4 shadow-sm shadow-slate-100/50">
          <div className="p-3.5 bg-red-50 text-red-500 rounded-2xl shrink-0">
            <Users size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tổng thành viên</p>
            <h3 className="text-2xl font-black text-slate-800 mt-1">{totalCount}</h3>
            <span className="inline-flex items-center text-[10px] font-bold text-green-500 bg-green-50 px-1.5 py-0.5 rounded-md mt-1">
              Active
            </span>
          </div>
        </div>

        {/* Widget 2 */}
        <div className="bg-white border border-slate-100 rounded-3xl p-6 flex items-center gap-4 shadow-sm shadow-slate-100/50">
          <div className="p-3.5 bg-indigo-50 text-indigo-500 rounded-2xl shrink-0">
            <ShieldCheck size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Quản trị viên</p>
            <h3 className="text-2xl font-black text-slate-800 mt-1">{adminCount}</h3>
            <span className="inline-flex items-center text-[10px] font-bold text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded-md mt-1">
              Full Access
            </span>
          </div>
        </div>

        {/* Widget 3 */}
        <div className="bg-white border border-slate-100 rounded-3xl p-6 flex items-center gap-4 shadow-sm shadow-slate-100/50">
          <div className="p-3.5 bg-blue-50 text-blue-500 rounded-2xl shrink-0">
            <Shield size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ban quản lý</p>
            <h3 className="text-2xl font-black text-slate-800 mt-1">{managerCount}</h3>
            <span className="inline-flex items-center text-[10px] font-bold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded-md mt-1">
              Moderators
            </span>
          </div>
        </div>

        {/* Widget 4 */}
        <div className="bg-white border border-slate-100 rounded-3xl p-6 flex items-center gap-4 shadow-sm shadow-slate-100/50">
          <div className="p-3.5 bg-slate-50 text-slate-500 rounded-2xl shrink-0">
            <UserCheck size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Thành viên thường</p>
            <h3 className="text-2xl font-black text-slate-800 mt-1">{userCount}</h3>
            <span className="inline-flex items-center text-[10px] font-bold text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded-md mt-1">
              Standard
            </span>
          </div>
        </div>
      </div>

      {/* Main card chứa danh sách CRUD */}
      <div className="bg-white border border-slate-100 rounded-3xl shadow-sm shadow-slate-100/50 overflow-hidden">
        {/* Header của bảng */}
        <div className="p-8 border-b border-slate-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-lg font-black text-slate-800">Danh sách thành viên</h2>
            <p className="text-xs text-slate-400 mt-0.5">Quản lý hồ sơ thông tin và phân quyền vai trò tài khoản</p>
          </div>

          <PermissionGuard permission="create_users">
            <button
              onClick={openCreateModal}
              className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-5 py-3 rounded-2xl font-bold text-sm shadow-lg shadow-red-500/20 transition-all cursor-pointer"
            >
              <Plus size={16} />
              <span>Thêm thành viên</span>
            </button>
          </PermissionGuard>
        </div>

        {/* Bảng dữ liệu */}
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm font-semibold">Đang tải dữ liệu thành viên...</div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">Chưa có thành viên nào trong hệ thống.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-50 bg-slate-50/50 text-slate-400 text-xs font-bold uppercase tracking-wider">
                  <th className="p-5 pl-8">Họ và Tên</th>
                  <th className="p-5">Email</th>
                  <th className="p-5">Số điện thoại</th>
                  <th className="p-5">Vai trò</th>
                  <th className="p-5 pr-8 text-right">Hành động</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50/30 transition-colors">
                    {/* Họ tên & Avatar */}
                    <td className="p-5 pl-8">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-red-50 border border-red-100 flex items-center justify-center font-extrabold text-xs text-red-500 uppercase shrink-0">
                          {u.name?.[0] ?? "U"}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-800 leading-tight">{u.name}</p>
                          <span className="text-[10px] text-slate-400">ID: #{u.id}</span>
                        </div>
                      </div>
                    </td>

                    {/* Email */}
                    <td className="p-5 text-sm font-medium text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <Mail size={14} className="text-slate-400" />
                        <span>{u.email}</span>
                      </div>
                    </td>

                    {/* Số điện thoại */}
                    <td className="p-5 text-sm font-medium text-slate-600">
                      {u.phone ? (
                        <div className="flex items-center gap-1.5">
                          <Phone size={14} className="text-slate-400" />
                          <span>{u.phone}</span>
                        </div>
                      ) : (
                        <span className="text-slate-300 font-normal">—</span>
                      )}
                    </td>

                    {/* Vai trò */}
                    <td className="p-5">
                      <span className={`inline-block text-[10px] px-2.5 py-0.5 border rounded-full font-bold uppercase ${
                        u.role === "ADMIN" 
                          ? "bg-indigo-50 text-indigo-500 border-indigo-100"
                          : u.role === "MANAGER"
                          ? "bg-blue-50 text-blue-500 border-blue-100"
                          : "bg-slate-50 text-slate-600 border-slate-200"
                      }`}>
                        {u.role ?? "USER"}
                      </span>
                    </td>

                    {/* Thao tác CRUD */}
                    <td className="p-5 pr-8 text-right space-x-1">
                      {/* Phân vai trò */}
                      {hasPermission("manage_roles") && (
                        <button
                          onClick={() => openRoleModal(u)}
                          className="p-2.5 text-indigo-500 hover:bg-indigo-50 rounded-xl transition-all cursor-pointer inline-flex"
                          title="Gán vai trò"
                        >
                          <ShieldAlert size={16} />
                        </button>
                      )}

                      {/* Sửa thông tin */}
                      <PermissionGuard permission="update_users">
                        <button
                          onClick={() => openEditModal(u)}
                          className="p-2.5 text-yellow-600 hover:bg-yellow-50 rounded-xl transition-all cursor-pointer inline-flex"
                          title="Cập nhật hồ sơ"
                        >
                          <Edit2 size={16} />
                        </button>
                      </PermissionGuard>

                      {/* Xóa người dùng */}
                      <PermissionGuard permission="delete_users">
                        {user && Number(user.id) === u.id ? (
                          <span 
                            className="p-2.5 text-slate-300 cursor-not-allowed inline-flex" 
                            title="Bạn không thể tự xóa tài khoản của mình"
                          >
                            <Trash2 size={16} />
                          </span>
                        ) : (
                          <button
                            onClick={() => handleDelete(u.id)}
                            className="p-2.5 text-red-500 hover:bg-red-50 rounded-xl transition-all cursor-pointer inline-flex"
                            title="Xóa thành viên"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </PermissionGuard>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: THÊM MỚI THÀNH VIÊN */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm z-50 p-4">
          <div className="bg-white border border-slate-100 rounded-3xl w-full max-w-md p-8 shadow-2xl space-y-5">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-black text-slate-800">Thêm thành viên mới</h3>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-50 rounded-xl transition-all cursor-pointer">
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Họ và Tên</label>
                <input
                  type="text"
                  required
                  placeholder="Nguyen Van A"
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-red-500 focus:bg-white transition-all"
                  value={createFormData.name}
                  onChange={(e) => setCreateFormData({ ...createFormData, name: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Email</label>
                <input
                  type="email"
                  required
                  placeholder="name@example.com"
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-red-500 focus:bg-white transition-all"
                  value={createFormData.email}
                  onChange={(e) => setCreateFormData({ ...createFormData, email: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Mật khẩu</label>
                <input
                  type="password"
                  placeholder="Để trống nếu muốn đặt mặc định (123456)"
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-red-500 focus:bg-white transition-all"
                  value={createFormData.password}
                  onChange={(e) => setCreateFormData({ ...createFormData, password: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Số điện thoại</label>
                <input
                  type="text"
                  placeholder="0912345678"
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-red-500 focus:bg-white transition-all"
                  value={createFormData.phone}
                  onChange={(e) => setCreateFormData({ ...createFormData, phone: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Giới thiệu (Bio)</label>
                <textarea
                  placeholder="Mô tả tóm tắt..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-red-500 focus:bg-white transition-all h-24 resize-none"
                  value={createFormData.bio}
                  onChange={(e) => setCreateFormData({ ...createFormData, bio: e.target.value })}
                />
              </div>

              <button type="submit" className="w-full bg-red-500 hover:bg-red-600 py-3.5 rounded-2xl font-bold text-white shadow-lg shadow-red-500/10 transition-all cursor-pointer mt-2">
                Lưu thành viên
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal: CẬP NHẬT HỒ SƠ */}
      {isEditModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm z-50 p-4">
          <div className="bg-white border border-slate-100 rounded-3xl w-full max-w-md p-8 shadow-2xl space-y-5">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-black text-slate-800">Cập nhật thông tin hồ sơ</h3>
              <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-50 rounded-xl transition-all cursor-pointer">
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Họ và Tên</label>
                <input
                  type="text"
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-red-500 focus:bg-white transition-all"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Số điện thoại</label>
                <input
                  type="text"
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-red-500 focus:bg-white transition-all"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Giới thiệu (Bio)</label>
                <textarea
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-red-500 focus:bg-white transition-all h-24 resize-none"
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                />
              </div>

              <button type="submit" className="w-full bg-red-500 hover:bg-red-600 py-3.5 rounded-2xl font-bold text-white shadow-lg shadow-red-500/10 transition-all cursor-pointer mt-2">
                Lưu thay đổi
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal: GÁN VAI TRÒ */}
      {isRoleModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm z-50 p-4">
          <div className="bg-white border border-slate-100 rounded-3xl w-full max-w-sm p-8 shadow-2xl space-y-5">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-black text-slate-800">Thiết lập vai trò tài khoản</h3>
              <button onClick={() => setIsRoleModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-50 rounded-xl transition-all cursor-pointer">
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handleRoleSubmit} className="space-y-5">
              <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl text-xs text-slate-500 flex items-start gap-2.5">
                <Info size={16} className="text-slate-400 shrink-0 mt-0.5" />
                <p>Bạn đang thay đổi phân quyền cho thành viên <b>{selectedUser?.name}</b>. Vai trò sẽ quyết định các giới hạn chức năng được phép thao tác.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Chọn vai trò chính</label>
                <select
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-sm text-slate-800 focus:outline-none focus:border-red-500 focus:bg-white transition-all cursor-pointer"
                  value={selectedRoles[0] || "USER"}
                  onChange={(e) => setSelectedRoles([e.target.value])}
                >
                  {roles.length > 0 ? (
                    roles.map((r) => (
                      <option key={r.id} value={r.name}>
                        {r.name} {r.name === 'ADMIN' ? '(Quản trị tối cao)' : r.name === 'MANAGER' ? '(Ban quản lý)' : r.name === 'USER' ? '(Thành viên cơ bản)' : ''}
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="USER">USER (Thành viên cơ bản)</option>
                      <option value="MANAGER">MANAGER (Ban quản lý)</option>
                      <option value="ADMIN">ADMIN (Quản trị tối cao)</option>
                    </>
                  )}
                </select>
              </div>

              <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 py-3.5 rounded-2xl font-bold text-white shadow-lg shadow-indigo-600/10 transition-all cursor-pointer">
                Cập nhật vai trò
              </button>
            </form>
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
