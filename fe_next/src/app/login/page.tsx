'use client';

import React, { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { ShieldAlert, Mail, Lock } from 'lucide-react';

function LoginInner() {
  const { login, isAuthenticated } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  // Redirect if already authenticated
  const from = searchParams.get('from') || '/';
  
  useEffect(() => {
    if (isAuthenticated) {
      router.replace(from);
    }
  }, [isAuthenticated, router, from]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg('Vui lòng điền đầy đủ email và mật khẩu.');
      return;
    }
    
    setErrorMsg('');
    setLoading(true);

    try {
      await login(email, password);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    alert('Chức năng đăng nhập Google đang được tích hợp. Vui lòng sử dụng tài khoản email thông thường hoặc tài khoản mặc định (admin/admin).');
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card animate-fade-in">
        <div className="auth-header">
          <div className="auth-logo">TranscriptHub</div>
          <h2 className="auth-title">Chào mừng trở lại</h2>
          <p className="auth-subtitle">Đăng nhập vào hệ thống quản lý</p>
        </div>

        {errorMsg && (
          <div className="alert alert-danger">
            <ShieldAlert size={16} style={{ flexShrink: 0 }} />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
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

          <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <label className="form-label" htmlFor="password-input">Mật khẩu</label>
            <div style={{ position: 'relative' }}>
              <input
                id="password-input"
                type="password"
                className="form-input"
                placeholder="••••••••"
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

          <button
            id="btn-login-submit"
            type="submit"
            className="btn btn-primary btn-submit"
            disabled={loading}
          >
            {loading ? 'Đang xác thực...' : 'Đăng nhập'}
          </button>
        </form>

        <div className="auth-divider">hoặc</div>

        <button
          onClick={handleGoogleLogin}
          className="btn-social"
          type="button"
          disabled={loading}
        >
          <svg className="google-icon" viewBox="0 0 24 24" width="24" height="24">
            <path
              fill="#EA4335"
              d="M12 5.04c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 1.74 14.96 1 12 1 7.36 1 3.41 3.67 1.48 7.56l3.77 2.92c.88-2.65 3.38-4.44 6.75-4.44z"
            />
            <path
              fill="#4285F4"
              d="M23.49 12.27c0-.81-.07-1.59-.2-2.36H12v4.51h6.46c-.29 1.48-1.14 2.73-2.4 3.58l3.73 2.89c2.18-2.01 3.7-4.99 3.7-8.62z"
            />
            <path
              fill="#FBBC05"
              d="M5.25 14.56c-.23-.69-.37-1.44-.37-2.21s.14-1.52.37-2.21L1.48 7.22C.54 9.12 0 11.24 0 13.5s.54 4.38 1.48 6.28l3.77-2.92z"
            />
            <path
              fill="#34A853"
              d="M12 23c3.24 0 5.97-1.07 7.96-2.92l-3.73-2.89c-1.04.7-2.38 1.12-4.23 1.12-3.37 0-5.87-1.79-6.75-4.44L1.48 16.8C3.41 20.69 7.36 23 12 23z"
            />
          </svg>
          <span>Đăng nhập với Google</span>
        </button>

        <div className="auth-footer">
          Chưa có tài khoản? <Link id="link-register" href="/register">Đăng ký ngay</Link>
        </div>

        <div style={{
          marginTop: '2rem',
          padding: '0.75rem',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--bg-main)',
          fontSize: '0.75rem',
          color: 'var(--text-muted)',
          textAlign: 'center',
          border: '1px dashed var(--border-color)'
        }}>
          <strong>Tài khoản mặc định thử nghiệm:</strong><br />
          Email: <code style={{ color: 'var(--primary-color)' }}>admin@gmail.com</code> | Pass: <code style={{ color: 'var(--primary-color)' }}>admin</code>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        Đang tải thông tin đăng nhập...
      </div>
    }>
      <LoginInner />
    </Suspense>
  );
}
