// Helper pour injecter les en-têtes d'identité lus par le middleware backend
// (requireRole/requirePermission utilise `id_user` et `username`).
export const getAuthHeaders = () => {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return {};
    const user = JSON.parse(raw);
    const headers = {};
    if (user?.id_user != null) headers.id_user = String(user.id_user);
    else if (user?.userData?.id_user != null) headers.id_user = String(user.userData.id_user);
    if (user?.username) headers.username = user.username;
    return headers;
  } catch {
    return {};
  }
};
