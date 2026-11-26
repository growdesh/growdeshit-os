import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, setApiAuthToken, setUnauthorizedHandler } from '../services/api';
import type { User } from '../types/models';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  needsSetup: boolean;
  loading: boolean;
  setupSuperadmin: (input: {
    name: string;
    email: string;
    phone: string;
    password: string;
  }) => Promise<void>;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => void;
  refreshSetupStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    setApiAuthToken(null);
    setToken(null);
    setUser(null);
  }, []);

  const refreshSetupStatus = useCallback(async () => {
    try {
      const status = await api.getSetupStatus();
      setNeedsSetup(status.needsSetup);
    } catch (error) {
      console.error('Failed to check setup status:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    void refreshSetupStatus();
    return () => setUnauthorizedHandler(null);
  }, [logout, refreshSetupStatus]);

  const setupSuperadmin = useCallback(
    async (input: { name: string; email: string; phone: string; password: string }) => {
      const result = await api.setupSuperadmin(input);
      setApiAuthToken(result.token);
      setToken(result.token);
      setUser(result.user);
      setNeedsSetup(false);
    },
    []
  );

  const login = useCallback(async (identifier: string, password: string) => {
    const result = await api.login({ identifier, password });
    setApiAuthToken(result.token);
    setToken(result.token);
    setUser(result.user);
    setNeedsSetup(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        needsSetup,
        loading,
        setupSuperadmin,
        login,
        logout,
        refreshSetupStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
