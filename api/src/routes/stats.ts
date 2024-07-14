import { app, db, logger } from '..';
import { Response } from 'express';
import { botReq } from './internal/ws';
import { WithId, Document, ObjectId } from 'mongodb';

let SERVER_COUNT = 0;

const fetchStats = async () => {
    try {
        const res = await botReq('stats');
        if (!res.success) return logger.warn(`Failed to fetch bot stats: ${res.statusCode} / ${res.error}`);
        if (res['servers']) SERVER_COUNT = Number(res['servers']);
    } catch(e) {
        console.error(e);
    }
}

fetchStats();
setInterval(() => fetchStats(), 10000);

app.get('/stats', async (res: Response) => {
    res.send({
        servers: SERVER_COUNT,
    });
});

app.get('/stats/global_blacklist', async (res: Response) => {
  try {
    const dbConnection = await db;
    
    const users = await dbConnection.collection('users').find({ globalBlacklist: true }).toArray();
    
    res.send({
      total: users.length,
      blacklist: users.map((u: WithId<Document>) => ({
        id: getId(u._id),
        reason: (u as any).blacklistReason || null
      })),
    });
  } catch(e) {
    console.error('Error fetching global blacklist:', e);
    res.status(500).send({ error: 'Internal server error' });
  }
});

function getId(id: string | ObjectId | undefined): string | null {
  if (typeof id === 'string') {
    return id.toUpperCase();
  } else if (id instanceof ObjectId) {
    return id.toHexString().toUpperCase();
  } else {
    return null;
  }
}
