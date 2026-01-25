import { useState, useEffect } from 'react';

export interface AuthUser {
  identityProvider: string;
  userId: string;
  userDetails: string; // email
  userRoles: string[];
}

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
}

/**
 * Hook to get Azure Static Web Apps authentication state
 */
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    user: null,
  });

  useEffect(() => {
    async function checkAuth() {
      try {
        const response = await fetch('/.auth/me');
        const data = await response.json();

        if (data.clientPrincipal) {
          setState({
            isAuthenticated: true,
            isLoading: false,
            user: {
              identityProvider: data.clientPrincipal.identityProvider,
              userId: data.clientPrincipal.userId,
              userDetails: data.clientPrincipal.userDetails,
              userRoles: data.clientPrincipal.userRoles || [],
            },
          });
        } else {
          setState({
            isAuthenticated: false,
            isLoading: false,
            user: null,
          });
        }
      } catch {
        setState({
          isAuthenticated: false,
          isLoading: false,
          user: null,
        });
      }
    }

    checkAuth();
  }, []);

  return state;
}

/**
 * Navigate to login
 */
export function login() {
  window.location.href = '/login';
}

/**
 * Navigate to logout
 */
export function logout() {
  window.location.href = '/logout';
}
