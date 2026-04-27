const { Client } = require('node-rfc');
const getSapConfig = require('../config/sapConfig');

// Récupérer la liste des champs d'une structure / table DDIC (ex: VBRKVB, VBRPVB, KOMV...)
const getStructureFields = async (req, res) => {
  let client;
  try {
    const tabname = (req.query.tabname || req.query.TABNAME || '').toUpperCase().trim();

    if (!tabname) {
      return res.status(400).json({
        success: false,
        error: 'Paramètre "tabname" requis (ex: VBRKVB, VBRPVB, VBPAVB, KOMV, KOMFK)',
      });
    }

    const sapConfig = await getSapConfig();
    client = new Client(sapConfig);
    await client.connect();

    const result = await client.call('DDIF_FIELDINFO_GET', {
      TABNAME: tabname,
      LANGU: 'F',
      ALL_TYPES: 'X',
    });

    const fields = result && Array.isArray(result.DFIES_TAB)
      ? result.DFIES_TAB
      : result && result.DFIES_TAB
        ? Object.values(result.DFIES_TAB)
        : [];

    const fieldNames = fields.map(f => f.FIELDNAME);

    return res.json({
      success: true,
      tabname,
      fieldNames,
      fields,
    });
  } catch (error) {
    console.error('Erreur lors de l\'appel à DDIF_FIELDINFO_GET:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erreur lors de la récupération des champs DDIC',
      details: error,
    });
  } finally {
    if (client) {
      try {
        await client.close();
      } catch (e) {
        console.error('Erreur lors de la fermeture de la connexion SAP:', e);
      }
    }
  }
};

module.exports = {
  getStructureFields,
};


