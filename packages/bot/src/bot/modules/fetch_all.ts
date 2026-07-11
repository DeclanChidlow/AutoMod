import { client } from "../..";

// Fetch all known users on bot startup.

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const RATE_LIMIT_DELAY = 3000;

(async () => {
	if (!client.user) await new Promise<void>((r) => client.once("ready", () => r()));

	console.info(`Starting to fetch users in ${client.servers.size()} servers.`);

	const promises: Promise<any>[] = [];
	let totalCachedUsers = 0;

	for (const [_, server] of client.servers.entries()) {
		promises.push(
			(async () => {
				await server.fetchMembers().catch((e: any) => console.error(`Error fetching members for server ${server.id}: ${e}`));
				totalCachedUsers = client.users.size();
				console.info(`Fetched members from server ${server.id}. Total cached users: ${totalCachedUsers}`);
			})(),
		);

		await delay(RATE_LIMIT_DELAY);
	}

	const res = await Promise.allSettled(promises);
	console.info(
		`Downloaded all users from ${res.filter((r) => r.status == "fulfilled").length} servers ` + `with ${res.filter((r) => r.status == "rejected").length} errors. Cache size: ${client.users.size()}`,
	);
})();
