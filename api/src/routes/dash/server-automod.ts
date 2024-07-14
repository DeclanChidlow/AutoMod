import { app } from '../..';
import { Request, Response } from 'express';
import { badRequest, ensureObjectStructure, isAuthenticated, requireAuth, unauthorized } from '../../utils';
import { botReq } from '../internal/ws';
import { Collection, Db } from 'mongodb';
import { ulid } from 'ulid';

let serversCollection: Collection;

export function initializeAutomodAPI(database: Db) {
    serversCollection = database.collection('servers');
}

type AntispamRule = {
    id: string;
    max_msg: number;
    timeframe: number;
    action: 0|1|2|3|4;
    channels: string[] | null;
    message: string | null;
}

app.get('/dash/server/:server/automod', requireAuth({ permission: 2 }), async (req: Request, res: Response) => {
    const user = await isAuthenticated(req, res, true);
    if (!user) return;

    const { server } = req.params;
    if (!server || typeof server != 'string') return badRequest(res);

    const response = await botReq('getUserServerDetails', { user, server });
    if (!response.success) {
        return res.status(response.statusCode ?? 500).send({ error: response.error });
    }

    if (!response['server']) return res.status(404).send({ error: 'Server not found' });

    const permissionLevel: 0|1|2|3 = response['perms'];
    if (permissionLevel < 1) return unauthorized(res, `Only moderators and bot managers may view this.`);

    const serverConfig = await serversCollection.findOne({ id: server });
    
    const result = {
        antispam: (serverConfig?.['automodSettings']?.spam as AntispamRule[]|undefined)
            ?.map(r => ({
                action: r.action,
                channels: r.channels,
                id: r.id,
                max_msg: r.max_msg,
                message: r.message,
                timeframe: r.timeframe,
            } as AntispamRule))
            ?? []
    }

    res.send(result);
});

app.patch('/dash/server/:server/automod/:ruleid', requireAuth({ permission: 2 }), async (req: Request, res: Response) => {
    const user = await isAuthenticated(req, res, true);
    if (!user) return;

    const { server, ruleid } = req.params;
    const body = req.body;
    if (!server || !ruleid) return badRequest(res);

    const serverConfig = await serversCollection.findOne({ id: server });
    const antiSpamRules: AntispamRule[] = serverConfig?.['automodSettings']?.spam ?? [];

    const rule = antiSpamRules.find(r => r.id == ruleid);
    if (!rule) return res.status(404).send({ error: 'No rule with this ID could be found.' });

    const result = await serversCollection.updateOne(
        { id: server, "automodSettings.spam.id": ruleid },
        {
            $set: {
                "automodSettings.spam.$": {
                    ...rule,
                    action: Number(body.action ?? rule.action),
                    channels: body.channels ?? rule.channels,
                    message: body.message ?? rule.message,
                    max_msg: body.max_msg ?? rule.max_msg,
                    timeframe: body.timeframe ?? rule.timeframe,
                }
            }
        }
    );

    return res.send({ success: result.modifiedCount > 0 });
});

app.post('/dash/server/:server/automod', requireAuth({ permission: 2 }), async (req, res) => {
    const user = await isAuthenticated(req, res, true);
    if (!user) return;

    const { server } = req.params;
    if (!server || typeof server != 'string') return badRequest(res);

    const response = await botReq('getUserServerDetails', { user, server });
    if (!response.success) {
        return res.status(response.statusCode ?? 500).send({ error: response.error });
    }

    if (!response['server']) return res.status(404).send({ error: 'Server not found' });

    let rule: any;
    try {
        rule = ensureObjectStructure(req.body, {
            max_msg: 'number',
            timeframe: 'number',
            action: 'number',
            message: 'string',
        }, true);
    } catch(e) { return res.status(400).send(e) }

    if (rule.action != null && rule.action < 0 || rule.action > 4) return res.status(400).send('Invalid action');

    const id = ulid();

    const result = await serversCollection.updateOne(
        { id: server },
        {
            $push: {
                "automodSettings.spam": {
                    id: id,
                    max_msg: rule.max_msg ?? 5,
                    timeframe: rule.timeframe ?? 3,
                    action: rule.action ?? 0,
                    message: rule.message ?? null,
                }
            }
        }
    );

    res.status(200).send({ success: result.modifiedCount > 0, id: id });
});

app.delete('/dash/server/:server/automod/:ruleid', requireAuth({ permission: 2 }), async (req, res) => {
    const user = await isAuthenticated(req, res, true);
    if (!user) return;

    const { server, ruleid } = req.params;
    if (!server || typeof server != 'string' || !ruleid || typeof ruleid != 'string') return badRequest(res);

    const response = await botReq('getUserServerDetails', { user, server });
    if (!response.success) {
        return res.status(response.statusCode ?? 500).send({ error: response.error });
    }

    if (!response['server']) return res.status(404).send({ error: 'Server not found' });

    let result;
    try {
        result = await serversCollection.updateOne(
            { id: server },
            {
                $pull: {
                    "automodSettings.spam": { id: ruleid }
                }
            }
        );
    } catch(e) {
        console.error(e);
        res.status(500).send({ error: e });
        return;
    }

    if (result.modifiedCount > 0) res.status(200).send({ success: true });
    else res.status(404).send({ success: false, error: 'Rule not found' });
});
