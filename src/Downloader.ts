import Electron from "electron";
import E621Downloader, { E621Error } from "e621downloader.js";
import ConfigManager from "./ConfigManager";

export default class Downloader {
	static CURRENT: {
		instance: E621Downloader;
		ipc: Electron.IpcMainEvent;
	} | null = null;
	static ACTIVE = false;
	static async start(tags: string[], folder: string, ipc: Electron.IpcMainEvent) {
		this.ACTIVE = true;
		const cnf = ConfigManager.get();
		const { instance: c } = this.CURRENT = {
			instance: new E621Downloader({
				auth: cnf.username && cnf.key ? {
					username: cnf.username,
					apiKey: cnf.key
				} : null,
				...cnf
			}),
			ipc
		};

		c
			.on("error", ipc.reply.bind(ipc, "message", "error"))
			.on("ready", ipc.reply.bind(ipc, "message", "ready"))
			.on("start-recieved", ipc.reply.bind(ipc, "message", "start-recieved"))
			.on("thread-done", ipc.reply.bind(ipc, "message", "thread-done"))
			.on("post-finish", ipc.reply.bind(ipc, "message", "post-finish"))
			.on("skip", ipc.reply.bind(ipc, "message", "skip"))
			.on("download-done", ipc.reply.bind(ipc, "message", "download-done"))
			.on("fetch-page", ipc.reply.bind(ipc, "message", "fetch-page"))
			.on("fetch-finish", ipc.reply.bind(ipc, "message", "fetch-finish"))
			.on("download-start", ipc.reply.bind(ipc, "message", "download-start"))
			.on("thread-spawn", ipc.reply.bind(ipc, "message", "thread-spawn"))
			.on("download-done", () => (this.CURRENT = null, this.ACTIVE = false)) // a kind of reset
			.startDownload(tags, folder, cnf.threads, cnf.blacklistedTags)
			.catch((err: Error & E621Error) => {
				switch (err.code) {
					case "ERR_NO_POSTS": {
						c.reset();
						ipc.reply("message", "no-posts", err.message);
						break;
					}

					// regular error
					case undefined: throw err;

					// unknown code
					default: throw err;
				}
			});
	}
}
