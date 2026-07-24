// PM2 — configuration de déploiement (Windows Server)
// Backend E-Facture : Express + Sequelize/MySQL + SAP RFC (node-rfc) sur le port 6050.
//
// Démarrage  : pm2 start ecosystem.config.js
// Recharge   : pm2 reload efacture-api        (zero-downtime en mode cluster)
// Logs       : pm2 logs efacture-api
// Monitoring : pm2 monit
//
// --- Utiliser 4 cœurs ---
// exec_mode: 'cluster' + instances: 4  => 4 workers Node qui écoutent le MÊME port 6050,
// avec répartition des connexions par l'OS. Prérequis : l'app doit être STATELESS
// (auth JWT/cookie, état en base — aucune variable globale partagée entre requêtes).
// Mets instances: 'max' pour utiliser tous les cœurs de la machine.

module.exports = {
  apps: [
    {
      name: 'efacture-api',
      script: './index.js',
      cwd: __dirname,

      // --- répartition multi-cœurs ---
      exec_mode: 'cluster',
      instances: 4,

      // --- robustesse ---
      autorestart: true,
      watch: false,                 // surtout pas true en prod
      max_memory_restart: '600M',   // redémarre un worker au-delà de 600 Mo
      kill_timeout: 8000,           // laisse le temps de fermer les connexions SAP/DB
      exp_backoff_restart_delay: 200,

      // --- logs ---
      output: './logs/out.log',
      error: './logs/error.log',
      merge_logs: true,
      time: true,                   // horodate chaque ligne de log

      // --- variables d'environnement ---
      // (les secrets DB/SAP restent dans .env, chargé par dotenv dans index.js)
      env: {
        NODE_ENV: 'production',
        PORT: 6050,
        UV_THREADPOOL_SIZE: 8       // pool libuv (I/O fs/crypto/DNS) ; rien à voir avec les cœurs CPU
      }
    }
  ]
};
