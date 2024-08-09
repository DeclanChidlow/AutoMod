import { config } from 'dotenv';
config();

import logger from './bot/logger';
import AutomodClient, { login } from './struct/AutomodClient';
import MongoDB, { databaseMigrations } from './bot/db';
import DbUser from 'automod/dist/types/DbUser';
import ServerConfig from 'automod/dist/types/ServerConfig';
import Infraction from 'automod/dist/types/antispam/Infraction';
import PendingLogin from 'automod/dist/types/PendingLogin';
import TempBan from 'automod/dist/types/TempBan';
import type { VoteEntry } from './bot/commands/moderation/votekick';

logger.info('Initializing client');

let db = MongoDB();
let client = new AutomodClient({
    autoReconnect: true,
}, db);
login(client);

const dbs = {
    SERVERS: db.get<ServerConfig>('servers'),
    USERS: db.get<DbUser>('users'),
    INFRACTIONS: db.get<Infraction>('infractions'),
    PENDING_LOGINS: db.get<PendingLogin>('pending_logins'),
    SESSIONS: db.get('sessions'),
    TEMPBANS: db.get<TempBan>('tempbans'),
    VOTEKICKS: db.get<VoteEntry>('votekicks'),
}

export { client, dbs }

logger.info(`\
    _          _         __  __           _ 
   / \\   _   _| |_  ___ |  \\/  | ___   __| |
  / _ \\ | | | | __|/ _ \\| |\\/| |/ _ \\ / _\` |
 / ___ \\| |_| | |_| (_) | |  | | (_) | (_| |
/_/   \\_\\\\__,_|\\__|\\___/|_|  |_|\\___/ \\__,_|
`);

(async () => {
    // Wait for a database query to succeed before loading the rest
    logger.info('Connecting to database...');
    await db.get('servers').findOne({});
    logger.done('DB ready!');

    logger.info('Running database migrations...');
    await databaseMigrations();

    // Load modules
    import('./bot/modules/command_handler');
    import('./bot/modules/mod_logs');
    import('./bot/modules/event_handler');
    import('./bot/modules/tempbans');
    import('./bot/modules/api_communication');
    import('./bot/modules/metrics');
    import('./bot/modules/bot_status');
    import('./bot/modules/fetch_all');
    import('./bot/modules/raid_detection');
})();
