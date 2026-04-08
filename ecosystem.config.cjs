module.exports = {
  apps: [
    {
      name: 'malebox',
      script: 'dist/index.cjs',
      cwd: '/apps/chatline',
      env_file: '/apps/chatline/.env',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 5062,
        DATABASE_URL: 'postgresql://malebox_user:1825Logan305!@localhost:5432/malebox_chatline'
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G'
    }
  ]
};
