import { getMutualServers, getPermissionLevelFromMember, parseUser } from "../../util";
import { client, dbs } from "../../..";
import ServerConfig from "automod-lib/dist/types/ServerConfig";
import type { WSResponse } from "../api_communication";
import { wsEvents } from "../api_communication";

type ReqData = { user: string };

wsEvents.on("req:getUserServers", async (data: ReqData, cb: (data: WSResponse) => void) => {
	try {
		const user = await parseUser(data.user);
		if (!user) {
			cb({ success: false, error: "The requested user could not be found", statusCode: 404 });
			return;
		}

		const mutuals = await getMutualServers(user);

		type ServerResponse = {
			id: string;
			perms: 0 | 1 | 2 | 3;
			name: string;
			iconURL?: string;
			bannerURL?: string;
			channelCount: number;
			ownerName?: string;
			createdAt: number;
			roleCount: number;
		};

		const serverIds = mutuals.map((s) => s.id);
		const configs = await dbs.SERVERS.find({ id: { $in: serverIds } }).toArray();
		const configMap = new Map<string, ServerConfig | null>(configs.map((c) => [c.id, c]));

		const promises: Promise<ServerResponse>[] = [];

		for (const server of mutuals) {
			promises.push(
				new Promise(async (resolve, reject) => {
					try {
						if (!server) return reject("Server not found");
						const member = client.serverMembers.getByKey({ server: server.id, user: user.id });
						const config = configMap.get(server.id);
						const perms = member ? getPermissionLevelFromMember(member, server, config) : 0;
						resolve({
							id: server.id,
							perms,
							name: server.name,
							bannerURL: server.bannerURL,
							iconURL: server.iconURL,
							channelCount: server.channels.filter((c) => c != null).length,
							ownerName: (() => {
								const o = server.owner;
								return o ? o.username : server.ownerId;
							})(),
							createdAt: server.createdAt.getTime(),
							roleCount: server.roles?.size ?? 0,
						});
					} catch (e) {
						console.error(e);
						reject(`${e}`);
					}
				}),
			);
		}

		cb({
			success: true,
			servers: (await Promise.allSettled(promises)).map((p) => (p.status == "fulfilled" ? p.value : undefined)),
		});
	} catch (e) {
		console.error(e);
		cb({ success: false, error: `${e}` });
	}
});
