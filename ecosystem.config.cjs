const fs = require('fs');
const path = require('path');

// Read .env file and parse it
function parseEnvFile(filePath) {
  const env = {};
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          let value = valueParts.join('=').trim();
          if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
          ) {
            value = value.slice(1, -1);
          }
          env[key.trim()] = value.trim().replace(/[\u200B-\u200D\uFEFF]/g, '');
        }
      }
    });
  } catch (error) {
    console.error('Error reading .env file:', error);
  }
  return env;
}

// Read environment variables from .env file
const envPath = '/apps/chatline/.env';
const envVars = parseEnvFile(envPath);

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
        NODE_ENV: envVars.NODE_ENV || 'production',
        PORT: envVars.PORT || 5062,
        DATABASE_URL: envVars.DATABASE_URL || 'postgresql://malebox_user:password@127.0.0.1/malebox_db?sslmode=disable',
        ELEVENLABS_API_KEY: envVars.ELEVENLABS_API_KEY || '',
        ELEVENLABS_VOICE_ID_ROGER: envVars.ELEVENLABS_VOICE_ID_ROGER || '',
        ELEVENLABS_VOICE_ID_MW: envVars.ELEVENLABS_VOICE_ID_MW || '',
        ELEVENLABS_VOICE_ID_MM: envVars.ELEVENLABS_VOICE_ID_MM || '',
        ELEVENLABS_VOICE_ID_MW_M: envVars.ELEVENLABS_VOICE_ID_MW_M || '',
        ELEVENLABS_VOICE_ID_GAME: envVars.ELEVENLABS_VOICE_ID_GAME || ''
      },
      error_file: '/apps/chatline/logs/pm2-error.log',
      out_file: '/apps/chatline/logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G'
    }
  ]
};
