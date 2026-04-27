const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/settingsController');
const { requireAdmin, attachAuth } = require('../middleware/requireRole');

// Un utilisateur authentifié peut lire son propre profil / permissions
router.get('/me', attachAuth(), (req, res) => {
    if (!req.auth) {
        return res.status(401).json({ success: false, error: 'UNAUTHENTICATED' });
    }
    ctrl.me(req, res);
});

// Catalogue des rôles : consultable par tout utilisateur authentifié (pour l'UI)
router.get('/roles', attachAuth(), (req, res) => {
    if (!req.auth) return res.status(401).json({ success: false, error: 'UNAUTHENTICATED' });
    ctrl.listRoles(req, res);
});

// Gestion des users : admin uniquement
router.get('/ldap-users',                  requireAdmin(), ctrl.listLdapUsers);
router.get('/users',                       requireAdmin(), ctrl.listUsers);
router.post('/users',                      requireAdmin(), ctrl.addUser);
router.put('/users/:id_user/type',         requireAdmin(), ctrl.updateUserType);
router.put('/users/:id_user/roles',        requireAdmin(), ctrl.setUserRoles);
router.delete('/users/:id_user',           requireAdmin(), ctrl.removeUser);

module.exports = router;
