import { useState, useEffect } from 'react';
import api from '../services/api';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'SM' | 'AM' | 'Admin';
  stationId?: string | null;
  areaId?: string | null;
}

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // AUTH DISABLED GLOBALLY
    const mockUser: User = {
      id: "mock-admin-id",
      email: "admin@system.local",
      name: "System Admin",
      role: "Admin",
      stationId: null,
      areaId: null
    };
    setUser(mockUser);
    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const response = await api.post('/api/auth/login', { email, password });
    const { token, user } = response.data;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    setUser(user);
    return user;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  const isAuthenticated = !!user;
  const isAdmin = user?.role === 'Admin';
  // Admin has all permissions
  const isSM = user?.role === 'SM' || isAdmin;
  const isAM = user?.role === 'AM' || isAdmin;

  return {
    user,
    loading,
    login,
    logout,
    isAuthenticated,
    isAdmin,
    isSM,
    isAM,
  };
};

