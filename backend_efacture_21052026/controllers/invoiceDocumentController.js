const { Client } = require('node-rfc');
const getSapConfig = require('../config/sapConfig');

// Fonction pour obtenir la structure de la BAPI
const getBapiStructure = async (req, res) => {
    let client;
    try {
        const sapConfig = await getSapConfig();
        client = new Client(sapConfig);
        await client.connect();

        // Obtenir la description complète de la BAPI
        const bapiDesc = await client.call('RFC_GET_FUNCTION_INTERFACE', {
            FUNCNAME: 'RV_INVOICE_DOCUMENT_READ',
            LANGUAGE: 'FR'
        });

        // Structure pour organiser les paramètres par type
        const organizedStructure = {
            importing: [],
            exporting: [],
            tables: [],
            changing: []
        };

        // Organiser les paramètres par type
        if (bapiDesc.PARAMS) {
            bapiDesc.PARAMS.forEach(param => {
                const paramInfo = {
                    name: param.PARAMETER,
                    description: param.PARAMTEXT || 'Pas de description disponible',
                    type: param.EXID,
                    optional: param.OPTIONAL === 'X',
                    length: param.INTLENGTH,
                    decimals: param.DECIMALS
                };

                switch (param.PARAMCLASS) {
                    case 'I':
                        organizedStructure.importing.push(paramInfo);
                        break;
                    case 'E':
                        organizedStructure.exporting.push(paramInfo);
                        break;
                    case 'T':
                        organizedStructure.tables.push(paramInfo);
                        break;
                    case 'C':
                        organizedStructure.changing.push(paramInfo);
                        break;
                }
            });
        }

        return res.json({
            success: true,
            bapiName: 'RV_INVOICE_DOCUMENT_READ',
            parameters: organizedStructure,
            rawStructure: bapiDesc // Structure brute complète pour référence
        });

    } catch (error) {
        console.error('Erreur lors de la récupération de la structure BAPI:', error);
        return res.status(500).json({
            success: false,
            error: 'Erreur lors de la récupération de la structure BAPI',
            details: error.message
        });
    } finally {
        if (client) {
            try {
                await client.close();
            } catch (e) {
                console.error('Erreur lors de la fermeture de la connexion:', e);
            }
        }
    }
};

// Fonction pour obtenir les détails d'une facture
const getInvoiceDocument = async (req, res) => {
    let client;
    try {
        const { documentNumber, fiscalYear } = req.query;

        if (!documentNumber) {
            return res.status(400).json({
                success: false,
                error: 'Le numéro de document est requis'
            });
        }

        const sapConfig = await getSapConfig();
        client = new Client(sapConfig);

        await client.connect();

        // Appel de la BAPI RV_INVOICE_DOCUMENT_READ
        const result = await client.call('RV_INVOICE_DOCUMENT_READ', {
            DOCUMENTNUMBER: documentNumber,
            FISCALYEAR: fiscalYear || new Date().getFullYear().toString(),
            ITEM_DATA: 'X',
            HEADER_DATA: 'X'
        });

        // Filtrer les lignes avec une quantité nulle (FKIMG == 0)
        if (result && result.XVBRP) {
            if (Array.isArray(result.XVBRP)) {
                result.XVBRP = result.XVBRP.filter(item => {
                    const qte = parseFloat(String(item.FKIMG).replace(',', '.'));
                    return qte !== 0;
                });
            }
        }

        return res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('Erreur lors de l\'appel à RV_INVOICE_DOCUMENT_READ:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Erreur lors de la récupération du document de facture',
            details: error
        });
    } finally {
        if (client) {
            try {
                await client.close();
            } catch (e) {
                console.error('Erreur lors de la fermeture de la connexion:', e);
            }
        }
    }
};

module.exports = {
    getInvoiceDocument,
    getBapiStructure
};
