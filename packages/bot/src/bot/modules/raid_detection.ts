import path from "path";
import { client } from "../..";

if (process.env["AUTOMOD_LOAD_SPAM_DETECTION"]) {
	console.info("Importing spam detection");
	import(path.join(process.cwd(), "..", "private", "automod-spam-detection", "dist", "index.js")).then((mod) => mod.raidDetection(client as any, client.db, process.env["REDIS_URL"]));
}
