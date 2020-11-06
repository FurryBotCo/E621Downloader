import { Octokit } from "@octokit/core";
const okt = new Octokit();

export default (async () =>
	okt.request("GET /repos/:owner/:repo/releases", {
		owner: "FurryBotCo",
		repo: "E621Downloader"
	})
);

