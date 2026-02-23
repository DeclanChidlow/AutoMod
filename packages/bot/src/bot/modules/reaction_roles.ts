import { client, dbs } from "../../index";

client.on("messageReactionAdd", async (message, user, emoji) => {
	if (user === client.user?.id) return;

	try {
		const normalizedEmoji = emoji.replace(/\uFE0F/g, "");

		const reactionRole = await dbs.REACTION_ROLES.findOne({ messageId: message.id, emoji: normalizedEmoji });
		if (!reactionRole) return;

		const server = client.servers.get(reactionRole.server);
		if (!server) return;

		const member = await server.fetchMember(user);
		if (!member) return;

		const currentRoles = member.roles || [];

		if (!currentRoles.includes(reactionRole.roleId)) {
			await member.edit({ roles: [...currentRoles, reactionRole.roleId] });
		}
	} catch (e) {
		console.error("Failed to process reaction role add:", e);
	}
});

client.on("messageReactionRemove", async (message, user, emoji) => {
	if (user === client.user?.id) return;

	try {
		const normalizedEmoji = emoji.replace(/\uFE0F/g, "");

		const reactionRole = await dbs.REACTION_ROLES.findOne({ messageId: message.id, emoji: normalizedEmoji });
		if (!reactionRole) return;

		const server = client.servers.get(reactionRole.server);
		if (!server) return;

		const member = await server.fetchMember(user);
		if (!member) return;

		const currentRoles = member.roles || [];

		if (currentRoles.includes(reactionRole.roleId)) {
			await member.edit({ roles: currentRoles.filter((role) => role !== reactionRole.roleId) });
		}
	} catch (e) {
		console.error("Failed to process reaction role remove:", e);
	}
});
