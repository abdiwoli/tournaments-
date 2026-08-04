import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const checkUserAuth = useCallback(async () => {
    setIsLoadingAuth(true);
    try { setUser(await globalThis.__LOCAL_DB__.auth.me()); }
    catch { setUser(null); }
    finally { setIsLoadingAuth(false); setAuthChecked(true); }
  }, []);
  useEffect(() => { checkUserAuth(); }, [checkUserAuth]);
  const logout = (shouldRedirect = true) => { setUser(null); globalThis.__LOCAL_DB__.auth.logout(shouldRedirect ? '/' : false); };
  const navigateToLogin = () => globalThis.__LOCAL_DB__.auth.redirectToLogin();
  return <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoadingAuth, isLoadingPublicSettings: false, authError: null, appPublicSettings: null, authChecked, logout, navigateToLogin, checkUserAuth, checkAppState: checkUserAuth }}>{children}</AuthContext.Provider>;
}
export const useAuth = () => { const context = useContext(AuthContext); if (!context) throw new Error('useAuth must be used within an AuthProvider'); return context; };
