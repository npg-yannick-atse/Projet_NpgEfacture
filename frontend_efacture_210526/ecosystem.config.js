// PM2 ecosystem — placé à la racine du dossier frontend.
// Lance uniquement le frontend (React, react-scripts start) sur le port 8048.
// Le backend est démarré séparément (autre machine ou autre processus PM2).
//
// Les chemins sont résolus relativement à l'emplacement de CE fichier (__dirname),
// donc on peut lancer `pm2 start ecosystem.config.js` depuis n'importe où.
const path = require('path');

const FRONTEND_CWD = __dirname;
// Logs centralisés à la racine du projet (..)
const LOG_DIR      = path.resolve(__dirname, '..', 'logs');

module.exports = {
  apps: [
    {
      name: 'efacture-frontend',
      cwd: FRONTEND_CWD,
      script: 'node_modules/react-scripts/scripts/start.js',
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 8048,
        BROWSER: 'none',
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: '1G',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: path.join(LOG_DIR, 'frontend-error.log'),
      out_file:   path.join(LOG_DIR, 'frontend-out.log'),
      merge_logs: true,
    },
  ],
};
