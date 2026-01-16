import { Message } from "stoat.js";
import { Server } from "stoat.js";

class MessageCommandContext extends Message {
	// The server to which the command should be applied.
	serverContext: Server;

	constructor(messageData: any, channelData: any, serverContext: Server) {
		// Assuming `Message` expects `messageData` and `channelData` as its arguments.
		super(messageData, channelData);
		this.serverContext = serverContext;
	}
}

export default MessageCommandContext;
