const TOKEN_KEY = 'classroomAccessToken';

export function getAccessToken() {
  return typeof window === 'undefined' ? null : window.sessionStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token) {
  if (typeof window !== 'undefined') window.sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearAccessToken() {
  if (typeof window !== 'undefined') window.sessionStorage.removeItem(TOKEN_KEY);
}
