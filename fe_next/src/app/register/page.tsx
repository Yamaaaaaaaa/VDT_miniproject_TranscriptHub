'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { ShieldAlert, CheckCircle, Mail, Lock, User } from 'lucide-react';

export default function RegisterPage() {
  const { register, isAuthenticated } = useAuth();
  const router = useRouter();

  const [username, setUsername] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    // Basic Validations
    if (!username || !email || !password || !confirmPassword) {
      setErrorMsg('Vui lòng nhập đầy đủ các trường.');
      return;
    }

    if (password.length < 8) {
      setErrorMsg('Mật khẩu phải chứa ít nhất 8 ký tự.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Mật khẩu nhập lại không khớp.');
      return;
    }

    setLoading(true);

    try {
      await register(username, email, password);
      setSuccessMsg('Đăng ký tài khoản thành công! Đang chuyển hướng sang trang đăng nhập...');
      // Clear form
      setUsername('');
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      // Redirect after 3s
      setTimeout(() => {
        router.push('/login');
      }, 3000);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Đăng ký tài khoản thất bại. Email hoặc tên tài khoản có thể đã được sử dụng.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card animate-fade-in">
        <div className="auth-header">
          <div className="auth-logo">TranscriptHub</div>
          <h2 className="auth-title">Đăng ký tài khoản</h2>
          <p className="auth-subtitle">Tham gia hệ thống TranscriptHub ngay hôm nay</p>
        </div>

        {errorMsg && (
          <div className="alert alert-danger">
            <ShieldAlert size={16} style={{ flexShrink: 0 }} />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="alert alert-success">
            <CheckCircle size={16} style={{ flexShrink: 0 }} />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="username-input">Tên đăng nhập (Username)</label>
            <div style={{ position: 'relative' }}>
              <input
                id="username-input"
                type="text"
                className="form-input"
                placeholder="vd: nguyenvana"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                style={{ paddingLeft: '2.5rem' }}
                disabled={loading}
              />
              <User size={16} style={{
                position: 'absolute',
                left: '0.875rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-light)'
              }} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="email-input">Địa chỉ Email</label>
            <div style={{ position: 'relative' }}>
              <input
                id="email-input"
                type="email"
                className="form-input"
                placeholder="ten@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{ paddingLeft: '2.5rem' }}
                disabled={loading}
              />
              <Mail size={16} style={{
                position: 'absolute',
                left: '0.875rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-light)'
              }} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password-input">Mật khẩu</label>
            <div style={{ position: 'relative' }}>
              <input
                id="password-input"
                type="password"
                className="form-input"
                placeholder="Tối thiểu 8 ký tự"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ paddingLeft: '2.5rem' }}
                disabled={loading}
              />
              <Lock size={16} style={{
                position: 'absolute',
                left: '0.875rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-light)'
              }} />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <label className="form-label" htmlFor="confirm-password-input">Xác nhận mật khẩu</label>
            <div style={{ position: 'relative' }}>
              <input
                id="confirm-password-input"
                type="password"
                className="form-input"
                placeholder="Nhập lại mật khẩu"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                style={{ paddingLeft: '2.5rem' }}
                disabled={loading}
              />
              <Lock size={16} style={{
                position: 'absolute',
                left: '0.875rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-light)'
              }} />
            </div>
          </div>

          <button
            id="btn-register-submit"
            type="submit"
            className="btn btn-primary btn-submit"
            disabled={loading}
          >
            {loading ? 'Đang tạo tài khoản...' : 'Đăng ký'}
          </button>
        </form>

        <div className="auth-footer">
          Đã có tài khoản? <Link id="link-login" href="/login">Đăng nhập ngay</Link>
        </div>
      </div>
    </div>
  );
}
