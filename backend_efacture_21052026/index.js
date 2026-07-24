require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');

// Importer les modèles pour qu'ils soient chargés
const db = require('./models');

// Routes
const sapRoutes = require('./routes/sapRoutes');
const invoiceDocumentRoutes = require('./routes/invoiceDocumentRoutes');
const authRoutes = require('./routes/authRoutes');
const logsRoutes = require('./routes/logsRoutes');
const sentInvoicesRoutes = require('./routes/sentInvoicesRoutes');
const downloadedInvoicesRoutes = require('./routes/downloadedInvoicesRoutes');
const inlineFieldRoutes = require('./routes/inlineFieldRoutes');
const fneInvoiceRoutes = require('./routes/fneInvoiceRoutes');

// Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';
const PORT = process.env.PORT || 6050;

const app = express();

// Tester la connexion à la base de données
async function testConnection() {
  try {
    await db.sequelize.authenticate();
    console.log('Connexion à la base de données établie avec succès.');

    // Synchroniser les modèles avec la base de données
    // En développement, vous pouvez utiliser { force: true } pour recréer les tables
    // En production, utilisez des migrations à la place
    if (process.env.NODE_ENV !== 'production') {
      await db.sequelize.sync();
      console.log('Modèles synchronisés avec la base de données.');
    }
  } catch (error) {
    console.error('Impossible de se connecter à la base de données:', error);
    process.exit(1);
  }
}

testConnection();

// Planificateur du téléchargement automatique des factures SAP (job admin)
try {
  require('./services/autoDownloadJob').startScheduler();
} catch (e) {
  console.error('[AUTO-DOWNLOAD] Impossible de démarrer le planificateur:', e.message);
}

// Configuration CORS plus permissive pour le développement
const corsOptions = {
  origin: function (origin, callback) {
    // En développement, autoriser toutes les origines
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }

    // En production, vérifier les origines autorisées
    const allowedOrigins = [
      process.env.CLIENT_ORIGIN || 'http://localhost:8048',
      'http://localhost:8048',
      'http://localhost:3000',
      'http://10.10.2.17:8048',
      'http://10.10.2.55:8048',
      'http://fne.npgandour.com',
      'https://fne.npgandour.com',
      'http://10.10.32.2:8048',
      'http://10.10.32.2:3000'
    ];

    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS: ' + origin));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'username', 'id_user', 'id-user'],
  optionsSuccessStatus: 200
};

// Appliquer CORS avant toutes les autres routes
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(morgan('tiny'))

// Routes API
app.use('/api/sap', sapRoutes)
app.use('/api/sap', invoiceDocumentRoutes)
app.use('/api/sap', require('./routes/sapInvoiceDetailsRoutes'))
app.use('/api/sap', require('./routes/sapSendInvoiceRoutes'))
app.use('/api/auth', authRoutes)
app.use('/api/logs', logsRoutes)
app.use('/api', sentInvoicesRoutes)
app.use('/api/downloaded-invoices', downloadedInvoicesRoutes)
app.use('/api/inline-fields', inlineFieldRoutes)
app.use('/api/notifications', require('./routes/notificationRoutes'))
app.use('/api/fne-invoices', fneInvoiceRoutes)
app.use('/api/fne', require('./routes/fneDuplicatesRoutes'))
app.use('/api/fne', require('./routes/fnePrintRoutes'))
app.use('/api/point-of-sale', require('./routes/pointOfSaleRoutes'))
app.use('/api/settings', require('./routes/settingsRoutes'))
app.use('/api/invoice-types', require('./routes/invoiceTypesRoutes'))
app.use('/api/bl-validations', require('./routes/blValidationRoutes'))
app.use('/api/auto-download', require('./routes/autoDownloadRoutes'))
app.use('/api/non-fne', require('./routes/nonFneRoutes'))

// Servir les fichiers statiques du frontend en production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'frontend/build')));

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend/build', 'index.html'));
  });
}

// Middleware pour gérer les erreurs
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Quelque chose a mal tourné!');
});

// Démarrer le serveur
const server = app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});

// Gestion des erreurs non capturées
process.on('unhandledRejection', (err) => {
  console.error('Erreur non gérée:', err);
  server.close(() => process.exit(1));
});
//.then(()=>console.log('connecter db '))
//.catch((err)=>console.log(err))
