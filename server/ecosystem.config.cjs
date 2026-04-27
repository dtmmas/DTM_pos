module.exports = {
  apps: [
    {
      name: 'dtmpos-api',
      cwd: './server',
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: 4003,
      },
    },
  ],
}
