import ConfigManager from "./ConfigManager";
import * as fs from "fs-extra";
import E621Downloader from "e621downloader.js";
import progress from "cli-progress";
import path from "path";
import { Time } from "@uwu-codes/utils";

export default class Refresh {
	static async run() {
		const cnf = ConfigManager.get();
		if (!cnf.useCache) throw new TypeError("Cache is not enabled. Launch the app, go to settings, enable it, and download some tags.");
		const v = path.resolve(`${cnf.saveDirectory}${cnf.saveDirectory.endsWith("E621Downloader/Files") ? "/.." : ""}/cache`);
		console.log(`Looking for cache files in directory "${v}"`);
		const e = new E621Downloader({
			...cnf,
			cacheDir: v
		});
		const p = new progress.SingleBar({
			hideCursor: true
		});
		function log(...a) {
			process.stdout.clearLine(0);
			process.stdout.cursorTo(0);
			console.log(...a);
		}

		let i = 0, t = 0;
		e
			.on("fetch-finish", (total, time) => {
				log(`Finished fetching ${total} posts in ${Time.ms(time, true, true, true)}`);
				p.start(total, 0, {
					speed: "N/A"
				});
				t = total;

			})
			.on("post-finish", (threadId, id, time, current, total) => {
				p.increment(1);
				i++;
				// log(`[${i}/${t}]: Finished downloading post #${id} in ${ms(time, true)}`);
			})
			.on("error", (err, extra) => console.error("Error:", err))
			.on("ready", (threadId) => log(`Thread #${threadId} is ready.`))
			.on("start-recieved", (threadId, amount) => log(`[Thread #${threadId}]: Recieved start with ${amount} posts.`))
			.on("thread-done", (threadId, amount, time) => log(`[Thread #${threadId}]: Finished downloading ${amount} posts in ${Time.ms(time, true, true, true)}`))
			.on("skip", (id, reason, tag) => {
				p.increment(1);
				i++;
				// because it can break stuff
				/* log(`[${i}/${t}]: Skipped post #${id} due to ${reason === "cache" ? "it being cached" :
					reason === "video" ? "it being a video, and skipVideo being true" :
						reason === "flash" ? "it being flash, and skipFlash being true" :
							reason === "fileExists" ? "the file existing, and overwriteExisting being set to false" :
								"unknown reasons"
					}.`); */
			})
			.on("download-done", (total, skipped, time) => {
				p.stop();
				log(`Finished downloading ${total} posts (skipped ${skipped}) in ${Time.ms(time, true, true, true)}`);
			})
			.on("fetch-page", (page, count, time) => log(`Finished fetching page #${page} in ${Time.ms(time, true, true, true)} (had ${count} posts)`))
			.on("download-start", (tags, folder, dir, threads) => {
				i = 0;
				log(`Started download with tags "${tags.join(" ")}" into directory "${dir}", with ${threads} threads.`);
			})
			.on("thread-spawn", (id, workerId) => log(`Spawned thread #${id} (Worker ID: ${workerId})`))
			// .on("debug", (location, info) => console.debug(`[${location}]:`, info))
			.on("error", (location, err) => console.error(`[${location}]:`, err))
			.on("warn", (location, info) => console.warn(`[${location}]:`, info));

		await e.refresh.run(cnf.threads).then(r => {
			for (const v of r) console.log(`[${v.tags.join(" ")}]: ${v.error === null ? v.total.old === v.total.new ? "No Change." : `+${v.total.new - v.total.old}` : `Error, ${v.error.stack}`}`);
		});
	}
}
