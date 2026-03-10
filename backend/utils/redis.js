const redis = require('redis');
const logger = require('./logger');

const client = redis.createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    retry_strategy: (options) => {
        if (options.error && options.error.code === 'ECONNREFUSED') {
            logger.error('Redis server connection refused');
        }
        if (options.total_retry_time > 1000 * 60 * 60) {
            return new Error('Retry time exhausted');
        }
        if (options.attempt > 10) {
            return undefined;
        }
        return Math.min(options.attempt * 100, 3000);
    }
});

client.on('error', (err) => logger.error('Redis Client Error', err));
client.on('connect', () => logger.info('Redis Client Connected'));

(async () => {
    await client.connect();
})();

module.exports = client;