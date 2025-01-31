import { ServerMember } from "revolt.js";
import { User } from "revolt.js";
import { client, dbs } from "../../..";
import ServerConfig from "automod/dist/types/ServerConfig";
import { getPermissionLevel } from "../../util";
import type { WSResponse } from "../api_communication";
import { wsEvents } from "../api_communication";

type ReqData = { user: string; server: string };
type APIUser = { id: string; username?: string; avatarURL?: string };
type APIChannel = { id: string; name: string; icon?: string; type: "VOICE" | "TEXT"; nsfw: boolean };

type ServerDetails = {
	id: string;
	perms: 0 | 1 | 2 | 3;
	name: string;
	description?: string;
	iconURL?: string;
	bannerURL?: string;
	serverConfig?: ServerConfig;
	users: APIUser[];
	channels: APIChannel[];
	dmOnKick?: boolean;
	dmOnWarn?: boolean;
	contact?: string;
};

wsEvents.on("req:getUserServerDetails", async (data: ReqData, cb: (data: WSResponse) => void) => {
	try {
		const server = client.servers.get(data.server);
		if (!server) return cb({ success: false, error: "The requested server could not be found", statusCode: 404 });

		let user: User;
		try {
			user = client.users.get(data.user) || (await client.users.fetch(data.user));
		} catch (e) {
			cb({ success: false, error: "The requested user could not be found", statusCode: 404 });
			return;
		}

		let member: ServerMember;
		try {
			member = await server.fetchMember(user);
		} catch (e) {
			cb({ success: false, error: "The requested user is not a member of that server", statusCode: 401 });
			return;
		}

		const serverConfig = await dbs.SERVERS.findOne({ id: server.id });

		// todo: remove unwanted keys from server config

		async function fetchUser(id: string) {
			try {
				return client.users.get(id) || (await client.users.fetch(id));
			} catch (e) {
				throw id; // this is stupid but idc
			}
		}

		const users = await Promise.allSettled([...(serverConfig?.botManagers?.map((u) => fetchUser(u)) ?? []), ...(serverConfig?.moderators?.map((u) => fetchUser(u)) ?? []), fetchUser(user.id)]);

		const response: ServerDetails = {
			id: server.id,
			name: server.name,
			perms: await getPermissionLevel(member, server),
			description: server.description ?? undefined,
			bannerURL: server.bannerURL,
			iconURL: server.iconURL,
			serverConfig: serverConfig as ServerConfig | undefined,
			users: users.map((u) => (u.status == "fulfilled" ? { id: u.value.id, avatarURL: u.value.avatarURL, username: u.value.username } : { id: u.reason })),
			channels: server.channels
				.filter((c) => c != undefined)
				.map((c) => ({
					id: c!.id,
					name: c!.name ?? "",
					nsfw: false, // todo?
					type: c!.type == "VoiceChannel" ? "VOICE" : "TEXT",
					icon: c!.iconURL,
				})),
			dmOnKick: serverConfig?.dmOnKick,
			dmOnWarn: serverConfig?.dmOnWarn,
			contact: serverConfig?.contact,
		};

		cb({ success: true, server: response });
	} catch (e) {
		console.error(e);
		cb({ success: false, error: `${e}` });
	}
});

export type { APIUser };
