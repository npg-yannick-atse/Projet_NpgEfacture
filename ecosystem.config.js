module.exports = {
  apps: [
    {
      name: 'efacture-frontend',
      cwd: './frontend_efacture',
      script: 'node_modules/react-scripts/scripts/start.js',
      watch: false,
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
        BROWSER: 'none',
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: '1G',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/frontend-error.log',
      out_file: './logs/frontend-out.log',
      merge_logs: true,
    },
  ],
};
