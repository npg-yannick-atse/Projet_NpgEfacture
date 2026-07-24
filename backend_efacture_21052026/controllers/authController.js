const axios = require('axios');
const jwt = require('jsonwebtoken');
const db = require('../models');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const LDAP_AUTH_URL = 'http://10.10.2.17:8000/users/ldap-authenticate';

exports.authenticateLDAP = async (req, res) => {
    try {
        console.log('=== Authentification LDAP ===');
        const { username, password } = req.body;

        console.log('Données reçues:', { username, password: password ? '***' : 'missing' });

        if (!username || !password) {
            console.log('Erreur: username ou password manquant');
            return res.status(400).json({ success: false, message: 'Username and password are required' });
        }

        // Call LDAP authentication endpoint
        console.log('Calling LDAP URL:', LDAP_AUTH_URL);
        console.log('With data:', { username, password: '***' });

        let response;
        try {
            response = await axios.post(LDAP_AUTH_URL, {
                username,
                password
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                timeout: 10000 // 10 secondes timeout
            });
        } catch (ldapError) {
            console.error('Erreur de connexion à LDAP:', ldapError.message);

            // Si LDAP n'est pas disponible, refuser l'authentification
            if (ldapError.code === 'ECONNREFUSED' || ldapError.code === 'ETIMEDOUT') {
                console.error('LDAP indisponible pour:', username);
                return res.status(503).json({
                    success: false,
                    message: 'Service d\'authentification indisponible. Veuillez réessayer plus tard.'
                });
            }

            throw ldapError;
        }

        console.log('LDAP Response status:', response.status);
        console.log('LDAP Response data:', response.data);

        if (response.data && (response.data.success || response.data.token)) {
            console.log('Authentification réussie pour:', username);

            // Vérifier si l'utilisateur est actif
            if (response.data.user && response.data.user.actif === 0) {
                console.log('Utilisateur inactif:', username);
                return res.status(401).json({
                    success: false,
                    message: 'Authentication failed. User account is disabled.'
                });
            }

            // Vérifier si l'id_user est dans la table auth pour restreindre l'accès
            let authRow = null;
            let permissions = [];
            if (response.data.user && response.data.user.id_user) {
                authRow = await db.Auth.findOne({
                    where: { id_user: response.data.user.id_user },
                    include: [{ model: db.Role, as: 'roles', through: { attributes: [] } }],
                });

                if (!authRow) {
                    console.log(`Accès refusé pour l'id_user: ${response.data.user.id_user} (${username})`);
                    return res.status(403).json({
                        success: false,
                        message: "Accès refusé. Vous n'êtes pas autorisé à accéder à cette application."
                    });
                }

                // Backfill du username dans la table auth si manquant
                if (!authRow.username) {
                    try {
                        await authRow.update({ username });
                    } catch (e) {
                        console.warn('Backfill username auth échoué:', e.message);
                    }
                }

                permissions = (authRow.roles || []).map(r => r.code);
            }

            return res.json({
                success: true,
                user: {
                    username,
                    id_user: authRow?.id_user || response.data.user?.id_user,
                    user_type: authRow?.user_type || 'utilisateur',
                    permissions,
                    userData: response.data.user
                }
            });
        } else {
            console.log('Échec authentification - réponse invalide');
            return res.status(401).json({
                success: false,
                message: 'Authentication failed. Invalid credentials.'
            });
        }
    } catch (error) {
        console.error('LDAP Authentication Error:', error.message);
        console.error('Full error:', error);

        if (error.response) {
            console.error('LDAP Response status:', error.response.status);
            console.error('LDAP Response data:', error.response.data);

            // Si LDAP renvoie une erreur 401 ou 404, c'est que les identifiants sont invalides ou l'utilisateur n'existe pas
            if (error.response.status === 401 || error.response.status === 404) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication failed. Invalid credentials or user not found.'
                });
            }
        }

        return res.status(500).json({
            success: false,
            message: 'An error occurred during authentication',
            error: error.message
        });
    }
};

exports.logDownload = async (req, res) => {
    try {
        const { documentId, documentType } = req.body;
        const userId = req.user.userId; // From JWT

        await db.DownloadLog.create({
            userId,
            action: 'DOWNLOAD',
            documentId,
            documentType,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Error logging download:', error);
        res.status(500).json({ success: false, message: 'Failed to log download' });
    }
};

exports.logDeletion = async (req, res) => {
    try {
        const { documentId, documentType } = req.body;
        const userId = req.user.userId; // From JWT

        await db.DownloadLog.create({
            userId,
            action: 'DELETE',
            documentId,
            documentType,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Error logging deletion:', error);
        res.status(500).json({ success: false, message: 'Failed to log deletion' });
    }
};

exports.getLogs = async (req, res) => {
    try {
        const logs = await db.DownloadLog.findAll({
            order: [['createdAt', 'DESC']],
            limit: 100
        });
        res.json({ success: true, logs });
    } catch (error) {
        console.error('Error fetching logs:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch logs' });
    }
};
