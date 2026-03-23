const AUTH_STORAGE_KEY = 'techwheels_auth_session_v1';

const DEFAULT_LOGIN_ID = 'admin';
const DEFAULT_LOGIN_PASSWORD = 'admin123';

// Temporary in-app identity mapping until login is backed by DB auth.
const LOGIN_CONTEXT_MAP = {
  jagatpura_manager: { employee_id: 1, location_id: 101, role: 'manager' },
  ajmer_manager: { employee_id: 2, location_id: 102, role: 'manager' },
  admin: { employee_id: 1, location_id: 101, role: 'admin' }
};

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

function getMappedUserContext(loginId) {
  const normalizedLoginId = String(loginId || '').trim().toLowerCase();
  return LOGIN_CONTEXT_MAP[normalizedLoginId] || null;
}

function buildSessionPayload(userId, userContext) {
  return {
    version: 1,
    userId,
    employee_id: userContext?.employee_id ?? null,
    location_id: userContext?.location_id ?? null,
    role: userContext?.role ?? null,
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

  const userContext = getMappedUserContext(normalizedId);
  const session = buildSessionPayload(normalizedId, userContext);
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

    return {
      ...parsed,
      employee_id: parsed?.employee_id ?? null,
      location_id: parsed?.location_id ?? null,
      role: parsed?.role ?? null
    };
  } catch {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return { isAuthenticated: false };
  }
}

export async function getCurrentUserContext() {
  const session = await restoreAuthSession();
  if (!session?.isAuthenticated) return null;

  return {
    userId: session.userId,
    employee_id: session.employee_id ?? null,
    location_id: session.location_id ?? null,
    role: session.role ?? null
  };
}

export async function clearAuthSession() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}
