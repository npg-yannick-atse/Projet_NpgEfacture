const { PointOfSale } = require('../models');

// Récupérer tous les points de vente
exports.getAllPointsOfSale = async (req, res) => {
    try {
        const pointsOfSale = await PointOfSale.findAll({
            order: [['libelle', 'ASC']]
        });
        res.json(pointsOfSale);
    } catch (error) {
        console.error('Erreur lors de la récupération des points de vente:', error);
        res.status(500).json({ error: 'Erreur serveur lors de la récupération des points de vente' });
    }
};

// Mettre à jour le statut actif d'un point de vente
exports.updatePointOfSaleStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { active } = req.body;

        const pos = await PointOfSale.findByPk(id);
        if (!pos) {
            return res.status(404).json({ error: 'Point de vente non trouvé' });
        }

        await pos.update({ active });

        res.json({ success: true, message: 'Statut mis à jour avec succès', data: pos });
    } catch (error) {
        console.error('Erreur lors de la mise à jour du point de vente:', error);
        res.status(500).json({ error: 'Erreur serveur lors de la mise à jour du point de vente' });
    }
};

// Mettre à jour plusieurs points de vente en même temps (pour la validation groupée)
exports.bulkUpdateStatus = async (req, res) => {
    try {
        const { selections } = req.body; // { id: true/false, ... }

        if (!selections || typeof selections !== 'object') {
            return res.status(400).json({ error: 'Données invalides' });
        }

        const updates = Object.entries(selections).map(([id, active]) => {
            return PointOfSale.update({ active }, { where: { id } });
        });

        await Promise.all(updates);

        res.json({ success: true, message: 'Points de vente mis à jour avec succès' });
    } catch (error) {
        console.error('Erreur lors de la mise à jour groupée des points de vente:', error);
        res.status(500).json({ error: 'Erreur serveur lors de la mise à jour groupée' });
    }
};
