import React, { createContext, useState, useContext, useEffect } from 'react';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing user on mount
    const storedUser = localStorage.getItem('user');

    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  const login = (token, user) => {
    setToken(token);
    setUser(user);
    localStorage.setItem('token', token || '');
    localStorage.setItem('user', JSON.stringify(user));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  // Rafraîchit user_type + permissions après modification côté serveur
  const updatePermissions = ({ user_type, permissions }) => {
    setUser(prev => {
      if (!prev) return prev;
      const next = {
        ...prev,
        ...(user_type !== undefined ? { user_type } : {}),
        ...(permissions !== undefined ? { permissions } : {}),
      };
      localStorage.setItem('user', JSON.stringify(next));
      return next;
    });
  };

  const isAdmin = () => user?.user_type === 'admin';
  const hasPermission = (code) => Array.isArray(user?.permissions) && user.permissions.includes(code);
  const hasAnyPermission = (codes = []) => codes.some(c => hasPermission(c));

  const value = {
    token,
    user,
    login,
    logout,
    updatePermissions,
    isAdmin,
    hasPermission,
    hasAnyPermission,
    isAuthenticated: !!user,
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthProvider;
