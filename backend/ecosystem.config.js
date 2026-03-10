module.exports = {
    apps: [{
        name: 'efootball-api',
        script: './server.js',
        instances: 'max', // Use all CPUs
        exec_mode: 'cluster',
        env: {
            NODE_ENV: 'production'
        },
        error_file: './logs/err.log',
        out_file: './logs/out.log',
        log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
        merge_logs: true,
        max_memory_restart: '500M',
        restart_delay: 3000,
        max_restarts: 5,
        min_uptime: '10s',
        kill_timeout: 5000,
        listen_timeout: 10000,
        // Health monitoring
        health_check_grace_period: 10000,
        health_check_fatal_exceptions: true,
        // Auto-restart on failure
        autorestart: true,
        // Don't restart if crashing too fast
        exp_backoff_restart_delay: 100
    }]
};