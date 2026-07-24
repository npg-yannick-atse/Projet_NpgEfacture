const { Auth, Role } = require('../models');

/**
 * Résout l'utilisateur courant à partir des en-têtes `id_user` ou `username`
 * et attache à req.auth = { id_user, username, user_type, permissions: string[] }.
 *
 * Note : l'admin doit avoir ses rôles cochés explicitement — aucun bypass.
 * Seules les actions d'ADMINISTRATION (gestion users/rôles) exigent user_type='admin'.
 */
async function loadAuth(req) {
    const idUserHeader = req.headers['id_user'] || req.headers['id-user'];
    const usernameHeader = req.headers['username'];

    if (!idUserHeader && !usernameHeader) return null;

    const where = {};
    if (idUserHeader) where.id_user = parseInt(idUserHeader, 10);
    else where.username = usernameHeader;

    const auth = await Auth.findOne({
        where,
        include: [{ model: Role, as: 'roles', through: { attributes: [] } }],
    });

    if (!auth) return null;

    return {
        id_user: auth.id_user,
        username: auth.username,
        user_type: auth.user_type,
        permissions: (auth.roles || []).map(r => r.code),
    };
}

/**
 * Exige que l'utilisateur possède la permission donnée (via user_roles).
 * Admin ou utilisateur — la règle est la même : permission doit être cochée.
 *
 * Usage : router.post('/send', requirePermission('invoice.send'), handler);
 */
const requirePermission = (codeInput) => {
    const allowed = Array.isArray(codeInput) ? codeInput : [codeInput];

    return async (req, res, next) => {
        try {
            const authCtx = await loadAuth(req);
            if (!authCtx) {
                return res.status(401).json({
                    success: false, error: 'UNAUTHENTICATED',
                    message: 'En-tête id_user ou username manquant/invalide',
                });
            }

            const hasAny = allowed.some(c => authCtx.permissions.includes(c));
            if (!hasAny) {
                return res.status(403).json({
                    success: false, error: 'MISSING_PERMISSION',
                    message: `Permission requise : ${allowed.join(' ou ')}`,
                    required: allowed,
                    user_permissions: authCtx.permissions,
                });
            }

            req.auth = authCtx;
            next();
        } catch (err) {
            console.error('requirePermission error:', err);
            res.status(500).json({ success: false, error: 'PERMISSION_CHECK_FAILED', message: err.message });
        }
    };
};

/**
 * Exige user_type='admin'. Pour les opérations de gestion (users, rôles).
 */
const requireAdmin = () => {
    return async (req, res, next) => {
        try {
            const authCtx = await loadAuth(req);
            if (!authCtx) {
                return res.status(401).json({
                    success: false, error: 'UNAUTHENTICATED',
                    message: 'En-tête id_user ou username manquant/invalide',
                });
            }

            if (authCtx.user_type !== 'admin') {
                return res.status(403).json({
                    success: false, error: 'ADMIN_ONLY',
                    message: 'Cette action est réservée aux administrateurs.',
                });
            }

            req.auth = authCtx;
            next();
        } catch (err) {
            console.error('requireAdmin error:', err);
            res.status(500).json({ success: false, error: 'ADMIN_CHECK_FAILED', message: err.message });
        }
    };
};

/**
 * Simple attach : résout req.auth si possible, sans bloquer.
 * Utile pour /settings/me et les pages lecture qui adaptent l'UI.
 */
const attachAuth = () => {
    return async (req, res, next) => {
        try {
            req.auth = await loadAuth(req);
        } catch (e) {
            req.auth = null;
        }
        next();
    };
};

module.exports = requirePermission;
module.exports.requirePermission = requirePermission;
module.exports.requireAdmin = requireAdmin;
module.exports.attachAuth = attachAuth;
