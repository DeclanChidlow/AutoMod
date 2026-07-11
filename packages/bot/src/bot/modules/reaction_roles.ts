import { client, dbs } from "../../index";

const normalizeEmoji = (emoji: string) => {
	return emoji.replace(/^:([A-Z0-9]+):$/i, "$1").replace(/[️︎]/g, "");
};

/**
 * Try to notify a user via DM that their reaction role could not be applied.
 * Swallows errors as we don't want notification failures to become unhandled rejections.
 */
async function notifyUser(userId: string, message: string) {
	try {
		const user = client.users.get(userId);
		if (!user) return;
		const dm = await user.openDM();
		if (dm) await dm.sendMessage({ content: message });
	} catch (_) {
		// DM could not be delivered (user has DMs closed, etc). Nothing AutoMod can do. :(
	}
}

client.on("messageReactionAdd", async (message, user, emoji) => {
	if (user === client.user?.id) return;

	try {
		const normalizedEmoji = normalizeEmoji(emoji);

		const reactionRole = await dbs.REACTION_ROLES.findOne({ messageId: message.id, emoji: normalizedEmoji });
		if (!reactionRole) return;

		const server = client.servers.get(reactionRole.server);
		if (!server) return;

		// Verify the role still exists on the server.
		if (!server.roles?.get(reactionRole.roleId)) {
			console.warn(`[ReactionRoles] Role ${reactionRole.roleId} no longer exists in server ${server.id}; removing orphaned entry`);
			await dbs.REACTION_ROLES.deleteOne({ _id: reactionRole._id }).catch(() => {});
			return;
		}

		// Always fetch fresh member data from the API to avoid stale-cache races.
		const member = await server.fetchMemberFresh(user);
		if (!member) return;

		const currentRoles = member.roles || [];

		if (!currentRoles.includes(reactionRole.roleId)) {
			await member.edit({ roles: [...currentRoles, reactionRole.roleId] });
		}
	} catch (e) {
		console.error("Failed to process reaction role add:", e);
		notifyUser(user, "Unable to assign your reaction role. Please contact a server admin.").catch(() => {});
	}
});

client.on("messageReactionRemove", async (message, user, emoji) => {
	if (user === client.user?.id) return;

	try {
		const normalizedEmoji = normalizeEmoji(emoji);

		const reactionRole = await dbs.REACTION_ROLES.findOne({ messageId: message.id, emoji: normalizedEmoji });
		if (!reactionRole) return;

		const server = client.servers.get(reactionRole.server);
		if (!server) return;

		// Verify the role still exists on the server.
		if (!server.roles?.get(reactionRole.roleId)) {
			console.warn(`[ReactionRoles] Role ${reactionRole.roleId} no longer exists in server ${server.id}; removing orphaned entry`);
			await dbs.REACTION_ROLES.deleteOne({ _id: reactionRole._id }).catch(() => {});
			return;
		}

		// Fetch fresh data, then send the full roles array minus the removed role.
		const member = await server.fetchMemberFresh(user);
		if (!member) return;

		const currentRoles = member.roles || [];
		if (currentRoles.includes(reactionRole.roleId)) {
			await member.edit({ roles: currentRoles.filter((role) => role !== reactionRole.roleId) });
		}
	} catch (e) {
		console.error("Failed to process reaction role remove:", e);
		notifyUser(user, "Unable to remove your reaction role. Please contact a server admin.").catch(() => {});
	}
});

// Clean up orphaned reaction role entries when a role is deleted from a server.
client.on("serverRoleDelete", async (server, roleId) => {
	try {
		const result = await dbs.REACTION_ROLES.deleteMany({ server: server.id, roleId });
		if (result.deletedCount > 0) {
			console.info(`[ReactionRoles] Cleaned up ${result.deletedCount} orphaned reaction role(s) for deleted role ${roleId} in server ${server.id}`);
		}
	} catch (e) {
		console.error("Failed to clean up orphaned reaction roles:", e);
	}
});
