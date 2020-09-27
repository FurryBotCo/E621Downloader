import express from "express";
import morgan from "morgan";
import ConfigManager from "../ConfigManager";
import pkg from "../../package.json";
import * as https from "https";
const config = ConfigManager.get();

const app = express();

app
	.use(morgan("dev"))
	.use(express.json())
	.use(express.urlencoded({ extended: false }))
	.get("/update", async (req, res) => {
		ConfigManager.edit({
			e621: {
				key: req.body.key,
				username: req.body.username
			}
		});

		return res.status(200).json({
			success: true,
			data: ConfigManager.get()
		});
	})
	.get("/autocomplete", async (req, res) => {
		https.request({
			method: "GET",
			host: "e621.net",
			path: `/tags/autocomplete.json?search%5Bname_matches%5D=${req.query.tag}`,
			headers: {
				"User-Agent": `E621Downloader/${pkg.version} (https://github/DonovanDMC/E621Downloader)`
			}
		}, (r) => {
			const data: any[] = [];

			if (r.statusCode !== 200) return res.status(500).json({
				success: false,
				error: `Non 200-OK status code: ${r.statusCode}-${r.statusMessage}`
			});

			r.on("error", (err) => res.status(500).json({
				success: false,
				error: err.stack
			}))
				.on("data", (d) => data.push(d))
				.on("end", () => {
					const d: {
						id: null; // I have *never* seen this not be null
						name: string;
						post_count: number;
						category: number;
						antecedent_name: string | null;
					}[] = JSON.parse(Buffer.concat(data).toString());
					return res.status(200).json({
						success: true,
						data: [
							...d.map(v => ({
								name: v.name,
								count: v.post_count,
								category: v.category
							})),
							...d.filter(v => v.antecedent_name !== null).map(v => ({
								name: v.antecedent_name,
								count: v.post_count,
								category: v.category
							}))
						]
					});
				});
		})
			.end();
	})
	.listen(config.api.port, config.api.host, () => console.log(`Listening on http://${config.api.host}:${config.api.port}`));
