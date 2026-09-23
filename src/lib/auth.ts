import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

export const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
];

const provider = new GoogleAuthProvider();
SCOPES.forEach((scope) => provider.addScope(scope));
provider.setCustomParameters({
  prompt: 'consent',
  access_type: 'offline',
});

declare global {
  interface Window {
    google?: any;
  }
}

// Flag to indicate if we are in the middle of a sign-in flow
let isSigningIn = false;
// Cache access token in memory (never in localStorage/sessionStorage)
let cachedAccessToken: string | null = null;
let cachedUser: User | any = null;

export const initAuth = (
  onAuthSuccess?: (user: User, token: string | null) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      cachedUser = user;
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        // User is logged in to Firebase, but access token needs acquisition via signInWithPopup
        if (onAuthSuccess) onAuthSuccess(user, null);
      }
    } else if (!cachedUser) {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const isUnauthorizedDomainError = (err: any): boolean => {
  if (!err) return false;
  const msg = typeof err === 'string' ? err : err.message || '';
  const code = err.code || '';
  return (
    code === 'auth/unauthorized-domain' ||
    msg.includes('auth/unauthorized-domain') ||
    msg.includes('unauthorized domain')
  );
};

export const setManualAccessToken = (token: string, email?: string) => {
  cachedAccessToken = token;
};

// Helper to ensure Google Identity Services client script is loaded
export const ensureGoogleClientLoaded = async (): Promise<boolean> => {
  if (typeof window === 'undefined') return false;
  if (window.google?.accounts?.oauth2) return true;

  // If script element not yet in DOM, add it
  if (!document.querySelector('script[src="https://accounts.google.com/gsi/client"]')) {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }

  return new Promise((resolve) => {
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (window.google?.accounts?.oauth2) {
        clearInterval(interval);
        resolve(true);
      } else if (attempts >= 30) {
        clearInterval(interval);
        resolve(false);
      }
    }, 100);
  });
};

/**
 * Attempts sign in via Google Identity Services (GIS) token client.
 * This directly interacts with Google OAuth and avoids Firebase unauthorized-domain issues.
 */
export const signInWithGIS = async (): Promise<{ user: any; accessToken: string }> => {
  const isLoaded = await ensureGoogleClientLoaded();
  if (!isLoaded || !window.google?.accounts?.oauth2) {
    throw new Error('Google Identity Services script is not yet ready. Please try again.');
  }

  const clientId = firebaseConfig.oAuthClientId;
  if (!clientId) {
    throw new Error('Google OAuth Client ID is missing in configuration.');
  }

  return new Promise((resolve, reject) => {
    try {
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile openid',
        prompt: '',
        callback: async (response: any) => {
          if (response.error) {
            reject(new Error(response.error_description || response.error));
            return;
          }

          const accessToken = response.access_token;
          if (!accessToken) {
            reject(new Error('No access token received from Google'));
            return;
          }

          cachedAccessToken = accessToken;

          try {
            const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (userRes.ok) {
              const profile = await userRes.json();
              const user: any = {
                uid: profile.sub || 'google-user-' + Date.now(),
                email: profile.email || 'user@gmail.com',
                displayName: profile.name || profile.email?.split('@')[0] || 'Google User',
                photoURL: profile.picture || null,
              };
              cachedUser = user;
              resolve({ user, accessToken });
              return;
            }
          } catch (profileErr) {
            console.warn('Could not fetch user profile info, using fallback user:', profileErr);
          }

          const fallbackUser: any = {
            uid: 'google-user-' + Date.now(),
            email: 'user@authorized.com',
            displayName: 'Google User',
            photoURL: null,
          };
          cachedUser = fallbackUser;
          resolve({ user: fallbackUser, accessToken });
        },
        error_callback: (err: any) => {
          reject(err);
        },
      });

      tokenClient.requestAccessToken();
    } catch (err) {
      reject(err);
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User | any; accessToken: string }> => {
  try {
    isSigningIn = true;

    // Step 1: Try Google Identity Services (GIS) first if available
    if (typeof window !== 'undefined' && window.google?.accounts?.oauth2 && firebaseConfig.oAuthClientId) {
      try {
        const gisResult = await signInWithGIS();
        return gisResult;
      } catch (gisErr: any) {
        // If GIS failed due to user closing window or explicit cancel, check message
        console.warn('GIS sign-in attempted, falling back to Firebase popup:', gisErr?.message || gisErr);
      }
    }

    // Step 2: Fallback to Firebase Auth signInWithPopup
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Google Auth. Please check permissions.');
    }
    cachedAccessToken = credential.accessToken;
    cachedUser = result.user;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    if (typeof window !== 'undefined') {
      error.currentHost = window.location.hostname;
    }
    // Use console.warn instead of console.error to avoid triggering unhandled runtime error overlays
    console.warn('Google sign-in status notice:', error?.code || error?.message || error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = (): string | null => {
  return cachedAccessToken;
};

export const setAccessToken = (token: string | null) => {
  cachedAccessToken = token;
};

export const logout = async () => {
  await signOut(auth);
  cachedAccessToken = null;
};
