const { Auth, Role, UserRole, sequelize } = require('../models');
const { Op } = require('sequelize');
const axios = require('axios');

const VALID_TYPES = ['admin', 'utilisateur'];
const LDAP_USERS_URL = process.env.LDAP_USERS_URL || 'http://10.10.2.17:8000/users';

// GET /api/settings/me — user_type + permissions du user courant
exports.me = async (req, res) => {
    res.json({ success: true, data: req.auth });
};

// GET /api/settings/ldap-users — liste des utilisateurs disponibles côté LDAP
// (pour l'autocomplete lors de l'ajout d'un user autorisé).
// Appelle LDAP_USERS_URL et renvoie un tableau uniformisé { id_user, username, display }.
exports.listLdapUsers = async (req, res) => {
    try {
        const search = (req.query.search || '').toLowerCase();
        const response = await axios.get(LDAP_USERS_URL, {
            headers: { 'Accept': 'application/json' },
            timeout: 10000,
        });

        // Le service LDAP peut renvoyer : [{...}] OU { users: [...] } OU { data: [...] }
        const raw = Array.isArray(response.data)
            ? response.data
            : (response.data?.users || response.data?.data || []);

        // Normaliser pour l'UI
        const users = raw.map(u => ({
            id_user: u.id_user ?? u.id ?? u.userId ?? null,
            username: u.username || u.login || u.uid || u.sAMAccountName || null,
            name: u.name_user || u.name || u.fullName || u.displayName || `${u.firstName || ''} ${u.lastName || ''}`.trim(),
            email: u.email || u.mail || null,
            matricule: u.matricule || null,
            actif: u.actif ?? u.active ?? 1,
        })).filter(u => u.id_user != null && u.actif !== 0); // on masque les inactifs

        // Récupérer les id_user déjà présents dans notre table auth pour les marquer
        const existing = await Auth.findAll({ attributes: ['id_user'], raw: true });
        const existingSet = new Set(existing.map(e => e.id_user));

        const enriched = users.map(u => ({
            ...u,
            already_added: existingSet.has(u.id_user),
        }));

        // Filtrage côté serveur si ?search= fourni
        const filtered = search
            ? enriched.filter(u =>
                (u.username || '').toLowerCase().includes(search) ||
                (u.name || '').toLowerCase().includes(search) ||
                String(u.id_user).includes(search))
            : enriched;

        res.json({ success: true, data: filtered, total: enriched.length });
    } catch (err) {
        console.error('listLdapUsers error:', err.message);
        res.status(502).json({
            success: false,
            error: 'LDAP_UNREACHABLE',
            message: `Impossible de récupérer la liste LDAP (${LDAP_USERS_URL}). Détail : ${err.message}`,
        });
    }
};

// GET /api/settings/roles — catalogue complet des permissions
exports.listRoles = async (req, res) => {
    try {
        const roles = await Role.findAll({ order: [['code', 'ASC']] });
        res.json({ success: true, data: roles });
    } catch (err) {
        console.error('listRoles error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// GET /api/settings/users — liste des utilisateurs avec leurs rôles
exports.listUsers = async (req, res) => {
    try {
        const users = await Auth.findAll({
            order: [['user_type', 'ASC'], ['username', 'ASC']],
            include: [{ model: Role, as: 'roles', through: { attributes: [] } }],
        });
        const data = users.map(u => ({
            id_user: u.id_user,
            username: u.username,
            user_type: u.user_type,
            createdAt: u.createdAt,
            permissions: (u.roles || []).map(r => r.code),
        }));
        res.json({ success: true, data, currentUser: req.auth });
    } catch (err) {
        console.error('listUsers error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// POST /api/settings/users — ajoute un user (type par défaut: utilisateur, aucun rôle)
exports.addUser = async (req, res) => {
    try {
        const { id_user, username, user_type } = req.body;

        if (!id_user) {
            return res.status(400).json({
                success: false, error: 'MISSING_ID_USER',
                message: 'id_user (LDAP) requis',
            });
        }
        const type = user_type || 'utilisateur';
        if (!VALID_TYPES.includes(type)) {
            return res.status(400).json({ success: false, error: 'INVALID_USER_TYPE' });
        }

        const existing = await Auth.findOne({ where: { id_user } });
        if (existing) {
            return res.status(409).json({
                success: false, error: 'USER_EXISTS',
                message: 'Cet utilisateur est déjà autorisé',
            });
        }

        const user = await Auth.create({
            id_user,
            username: username || null,
            user_type: type,
        });

        console.log(`[SETTINGS] ${req.auth.username} a ajouté ${username} (id=${id_user}) type=${type}`);
        res.status(201).json({
            success: true,
            data: { id_user: user.id_user, username: user.username, user_type: user.user_type, permissions: [] },
        });
    } catch (err) {
        console.error('addUser error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// PUT /api/settings/users/:id_user/type — change le type (admin/utilisateur)
exports.updateUserType = async (req, res) => {
    try {
        const idUser = parseInt(req.params.id_user, 10);
        const { user_type } = req.body;

        if (!VALID_TYPES.includes(user_type)) {
            return res.status(400).json({ success: false, error: 'INVALID_USER_TYPE' });
        }

        const user = await Auth.findOne({ where: { id_user: idUser } });
        if (!user) {
            return res.status(404).json({ success: false, error: 'USER_NOT_FOUND' });
        }

        // Bloquer si on retire le dernier admin
        if (user.user_type === 'admin' && user_type !== 'admin') {
            const adminCount = await Auth.count({ where: { user_type: 'admin' } });
            if (adminCount <= 1) {
                return res.status(409).json({
                    success: false, error: 'LAST_ADMIN',
                    message: 'Impossible de rétrograder le dernier administrateur.',
                });
            }
        }

        const previousType = user.user_type;
        await user.update({ user_type });
        console.log(`[SETTINGS] ${req.auth.username} : ${user.username} passé de ${previousType} à ${user_type}`);

        res.json({
            success: true,
            data: { id_user: user.id_user, username: user.username, user_type: user.user_type },
        });
    } catch (err) {
        console.error('updateUserType error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// PUT /api/settings/users/:id_user/roles — remplace l'ensemble des rôles (codes[])
exports.setUserRoles = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const idUser = parseInt(req.params.id_user, 10);
        const { codes } = req.body;

        if (!Array.isArray(codes)) {
            await t.rollback();
            return res.status(400).json({
                success: false, error: 'INVALID_BODY',
                message: 'Body attendu : { codes: ["role.code", ...] }',
            });
        }

        const user = await Auth.findOne({ where: { id_user: idUser }, transaction: t });
        if (!user) {
            await t.rollback();
            return res.status(404).json({ success: false, error: 'USER_NOT_FOUND' });
        }

        // Valider les codes → ids
        const uniqueCodes = [...new Set(codes)];
        const roles = uniqueCodes.length > 0
            ? await Role.findAll({ where: { code: { [Op.in]: uniqueCodes } }, transaction: t })
            : [];

        if (roles.length !== uniqueCodes.length) {
            const foundCodes = roles.map(r => r.code);
            const missing = uniqueCodes.filter(c => !foundCodes.includes(c));
            await t.rollback();
            return res.status(400).json({
                success: false, error: 'UNKNOWN_ROLE_CODES',
                message: `Codes inexistants : ${missing.join(', ')}`,
            });
        }

        // Reset puis insert
        await UserRole.destroy({ where: { id_user: idUser }, transaction: t });
        if (roles.length > 0) {
            await UserRole.bulkCreate(roles.map(r => ({
                id_user: idUser,
                role_id: r.id,
                granted_at: new Date(),
                granted_by: req.auth.username,
            })), { transaction: t });
        }

        await t.commit();
        console.log(`[SETTINGS] ${req.auth.username} a fixé les rôles de ${user.username} : [${uniqueCodes.join(', ')}]`);

        res.json({
            success: true,
            data: {
                id_user: idUser,
                username: user.username,
                user_type: user.user_type,
                permissions: uniqueCodes,
            },
        });
    } catch (err) {
        await t.rollback();
        console.error('setUserRoles error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// DELETE /api/settings/users/:id_user
exports.removeUser = async (req, res) => {
    try {
        const idUser = parseInt(req.params.id_user, 10);

        if (req.auth.id_user === idUser) {
            return res.status(409).json({
                success: false, error: 'CANNOT_DELETE_SELF',
                message: 'Impossible de se retirer soi-même.',
            });
        }

        const user = await Auth.findOne({ where: { id_user: idUser } });
        if (!user) {
            return res.status(404).json({ success: false, error: 'USER_NOT_FOUND' });
        }

        if (user.user_type === 'admin') {
            const adminCount = await Auth.count({ where: { user_type: 'admin' } });
            if (adminCount <= 1) {
                return res.status(409).json({
                    success: false, error: 'LAST_ADMIN',
                    message: 'Impossible de supprimer le dernier administrateur.',
                });
            }
        }

        await user.destroy();
        console.log(`[SETTINGS] ${req.auth.username} a retiré ${user.username} (id=${idUser})`);
        res.json({ success: true });
    } catch (err) {
        console.error('removeUser error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};
