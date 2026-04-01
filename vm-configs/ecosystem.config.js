module.exports = {
  apps: [
    {
      name: 'crm-backend',
      cwd: 'C:\\crm\\backend\\crm-backend',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      max_memory_restart: '1G',
      error_file: 'C:\\crm\\logs\\backend-error.log',
      out_file: 'C:\\crm\\logs\\backend-out.log',
      merge_logs: true,
      time: true,
    },
    {
      name: 'crm-frontend',
      cwd: 'C:\\crm\\frontend\\crm-frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 4002',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 4002,
      },
      max_memory_restart: '512M',
      error_file: 'C:\\crm\\logs\\frontend-error.log',
      out_file: 'C:\\crm\\logs\\frontend-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
