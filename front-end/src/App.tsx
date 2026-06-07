import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import MainLayout from './components/MainLayout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import UserManagement from './pages/UserManagement';
import RoleManagement from './pages/RoleManagement';
import FileManagement from './pages/FileManagement';
import ScriptManagement from './pages/ScriptManagement';
import { ScriptDetail } from './pages/ScriptDetail';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Authentication Pages */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Protected Dashboard Layout Pages */}
          <Route 
            path="/" 
            element={
              <ProtectedRoute>
                <MainLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="users" element={<UserManagement />} />
            <Route path="roles" element={<RoleManagement />} />
            <Route path="files" element={<FileManagement />} />
            <Route path="scripts" element={<ScriptManagement />} />
            <Route path="scripts/:fileId" element={<ScriptDetail />} />
          </Route>

          {/* Catch-all Fallback */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
