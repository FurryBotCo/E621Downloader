import * as https from "https";
import uuid from "uuid";
import ConfigManager from "./ConfigManager";
import pkg from "../package.json";
import Logger from "./Logger";

class AnalyticsError extends Error {
	constructor(message?: string | Error) {
		if (message instanceof Error) message = message.message;
		super(message);
		this.name = "AnalyticsError";
	}
}

export default class Analytics {
	private constructor() { }

	static async track(type: string, extra: { [k: string]: any; } | null = null) {
		if (!ConfigManager.get().analytics) return;
		await new Promise((a, b) => {
			const d = JSON.stringify({
				type,
				id: this.getId(),
				extra
			});

			const req = https
				.request({
					method: "POST",
					hostname: "e621.download",
					path: "/track",
					port: 443,
					protocol: "https:",
					headers: {
						"User-Agent": `E621Downloader/${pkg.version} (https://github.com/FurryBotCo/E621Downloader)`,
						"Content-Length": d.length
					}
				}, (res) => {
					const data: Buffer[] = [];

					res
						.on("data", (d) => data.push(d))
						.on("error", b)
						.on("end", () => {
							let d = Buffer.concat(data).toString();
							try {
								d = JSON.parse(d);
							} catch (e) { }
							return res.statusCode! > 299 ? b(new AnalyticsError(d)) : a(d);
						});
				});
			req.write(d);
			req.end();
		}).catch(err => {
			Logger.error("Analytics", `${err.name}: ${err.message}`);
			throw err;
		});
	}

	static generateId() { return uuid.v4(); }
	static getId() {
		if (!ConfigManager.get().analyticsId) ConfigManager.edit({
			analyticsId: this.generateId()
		});

		return ConfigManager.get().analyticsId!;
	}
}
