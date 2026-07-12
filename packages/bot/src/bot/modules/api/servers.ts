import { getMutualServers, getPermissionLevel, parseUser } from "../../util";
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
			memberCount: number | null;
			channelCount: number;
			ownerName?: string;
			createdAt: number;
			roleCount: number;
			botCount: number | null;
		};

		const promises: Promise<ServerResponse>[] = [];

		for (const server of mutuals) {
			promises.push(
				new Promise(async (resolve, reject) => {
					try {
						if (!server) return reject("Server not found");
						const perms = await getPermissionLevel(user, server);
						resolve({
							id: server.id,
							perms,
							name: server.name,
							bannerURL: server.bannerURL,
							iconURL: server.iconURL,
							memberCount: null, // too expensive to fetch per-server in list; detail page has accurate count
							channelCount: server.channels.filter((c) => c != null).length,
							ownerName: server.owner?.username ?? undefined,
							createdAt: server.createdAt.getTime(),
							roleCount: server.roles?.size ?? 0,
							botCount: null,
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
