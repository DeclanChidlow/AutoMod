/**
 * Only the permissions actually used by the bot are defined here.
 */
export const U32_MAX = 2 ** 32 - 1;

export const UserPermission = {
	Access: 1 << 0,
	ViewProfile: 1 << 1,
	SendMessage: 1 << 2,
	Invite: 1 << 3,
} as const;

export const Permission = {
	ManageChannel: 2n ** 0n,
	ManageServer: 2n ** 1n,
	ManagePermissions: 2n ** 2n,
	ManageRole: 2n ** 3n,
	ManageCustomisation: 2n ** 4n,
	KickMembers: 2n ** 6n,
	BanMembers: 2n ** 7n,
	ManageNicknames: 2n ** 8n,
	ChangeNickname: 2n ** 9n,
	ManageMessages: 2n ** 10n,
	SendMessage: 2n ** 11n,
	SendEmbeds: 2n ** 12n,
	UploadFiles: 2n ** 13n,
	Masquerade: 2n ** 14n,
	React: 2n ** 15n,
	Connect: 2n ** 16n,
	Speak: 2n ** 17n,
	Video: 2n ** 18n,
	MuteMembers: 2n ** 19n,
	DeafenMembers: 2n ** 20n,
	MoveMembers: 2n ** 21n,
	ViewChannel: 2n ** 23n,
	AssignRoles: 2n ** 24n,
} as const;

/**
 * Check if all given permission bits are set in a target.
 */
export function bitwiseAndEq(target: bigint | number, ...bits: (bigint | number)[]): boolean {
	if (typeof target === "number") target = BigInt(target);
	for (const bit of bits) {
		const b = typeof bit === "number" ? BigInt(bit) : bit;
		if ((target & b) !== b) return false;
	}
	return true;
}
