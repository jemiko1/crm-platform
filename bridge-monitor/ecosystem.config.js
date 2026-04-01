module.exports = {
  apps: [
    {
      name: "bridge-monitor",
      script: "server.js",
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      watch: false,
      max_memory_restart: "128M",
      env: {
        NODE_ENV: "production",
        MONITOR_PORT: "3200",
      },
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "logs/error.log",
      out_file: "logs/out.log",
      merge_logs: true,
    },
  ],
};
