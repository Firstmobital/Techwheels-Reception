const AUTH_STORAGE_KEY = 'techwheels_auth_session_v1';

const DEFAULT_LOGIN_ID = 'admin';
const DEFAULT_LOGIN_PASSWORD = 'admin123';

function getConfiguredCredentials() {
  const configuredId = String(import.meta.env.VITE_LOGIN_ID || DEFAULT_LOGIN_ID).trim();
  const configuredPassword = String(
    import.meta.env.VITE_LOGIN_PASSWORD || DEFAULT_LOGIN_PASSWORD
  ).trim();

  return {
    id: configuredId,
    password: configuredPassword
  };
}

function buildSessionPayload(userId) {
  return {
    version: 1,
    userId,
    isAuthenticated: true,
    createdAt: new Date().toISOString()
  };
}

export async function loginWithCredentials({ id, password }) {
  const normalizedId = String(id || '').trim();
  const normalizedPassword = String(password || '').trim();
  const credentials = getConfiguredCredentials();

  if (!normalizedId || !normalizedPassword) {
    throw new Error('Please enter both ID and password.');
  }

  if (normalizedId !== credentials.id || normalizedPassword !== credentials.password) {
    throw new Error('Invalid ID or password.');
  }

  const session = buildSessionPayload(normalizedId);
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  return session;
}

export async function restoreAuthSession() {
  const rawSession = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!rawSession) return { isAuthenticated: false };

  try {
    const parsed = JSON.parse(rawSession);
    if (parsed?.version !== 1 || parsed?.isAuthenticated !== true || !parsed?.userId) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return { isAuthenticated: false };
    }

    return parsed;
  } catch {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return { isAuthenticated: false };
  }
}

export async function clearAuthSession() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}
