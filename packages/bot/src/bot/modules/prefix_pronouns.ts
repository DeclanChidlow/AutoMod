import { client } from "../..";
import { Server } from "../../stoat/index.js";
import { wsEvents } from "./api_communication";

// The Stoat API limits pronouns to 24 characters.
const PRONOUNS_MAX_LENGTH = 24;

function prefixPronounText(prefix: string): string {
	const sanitised = prefix.replace(/\s+/g, " ").trim();
	if (!sanitised) return "";
	const text = `Prefix: ${sanitised}`;
	return text.length > PRONOUNS_MAX_LENGTH ? sanitised.slice(0, PRONOUNS_MAX_LENGTH) : text;
}

async function setServerPrefixPronouns(server: Server, prefix: string): Promise<void> {
	if (!client.user) return;

	const pronouns = prefixPronounText(prefix);
	if (!pronouns) return;

	const member = await server.fetchMemberFresh(client.user.id).catch(() => undefined);
	if (!member || member.pronouns === pronouns) return;

	try {
		await member.edit({ pronouns });
		console.info(`Updated AutoMod's pronouns in server ${server.id} to "${pronouns}"`);
	} catch (e) {
		console.warn(`Failed to update AutoMod's pronouns in server ${server.id}: ${e}`);
	}
}

async function clearServerPrefixPronouns(server: Server): Promise<void> {
	if (!client.user) return;

	const member = await server.fetchMemberFresh(client.user.id).catch(() => undefined);
	if (!member || !member.pronouns) return;

	try {
		await member.edit({ pronouns: null, remove: ["Pronouns"] });
		console.info(`Cleared AutoMod's pronouns in server ${server.id}`);
	} catch (e) {
		console.warn(`Failed to clear AutoMod's pronouns in server ${server.id}: ${e}`);
	}
}

wsEvents.on("push:prefixChanged", (data: { server?: string; prefix?: string | null }) => {
	const server = data?.server ? client.servers.get(data.server) : undefined;
	if (!server) return;

	if (data.prefix) setServerPrefixPronouns(server, data.prefix).catch((e) => console.warn("Failed to update prefix pronouns:", e));
	else clearServerPrefixPronouns(server).catch((e) => console.warn("Failed to clear prefix pronouns:", e));
});

export { setServerPrefixPronouns, clearServerPrefixPronouns };
