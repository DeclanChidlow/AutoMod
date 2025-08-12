import { Message } from "revolt.js";
import { client } from "../../../..";
import CustomRuleAction from "automod-lib/dist/types/antispam/CustomRuleAction";

async function execute(message: Message, action: CustomRuleAction) {
	let text = action.text || "Error: No text specified for `sendMessage` action";
	if (text.length > 2000) {
		text = text.slice(0, 1996) + " ...";
	}

	if (!message.channel) {
		if (!message.channelId) throw new Error("No channel ID available");
		await client.channels.fetch(message.channelId);
	}
	let msg = await message.channel!.sendMessage(text);

	if (action.duration) {
		setTimeout(() => {
			msg.delete().catch(console.warn);
		}, action.duration * 1000);
	}
}

export default execute;
