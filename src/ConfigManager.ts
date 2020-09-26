import * as fs from "fs-extra";
import YAML from "js-yaml";
import path from "path";

type DeepPartial<T> = {
	[P in keyof T]?: DeepPartial<T[P]>;
};

interface Config {
	e621: {
		key: string;
		username: string;
		directory: string;
	};
	api: {
		host: string;
		port: number;
	};
}

export default class ConfigManager {
	static ROOT_DIR = path.resolve(`${__dirname}/../${__filename.endsWith("ts") ? "" : "../"}`);
	static CONFIG_LOCATION = path.resolve(`${ConfigManager.ROOT_DIR}/config.yaml`);
	static loadFile() { return fs.readFileSync(this.CONFIG_LOCATION); }

	static get() {
		const f = this.loadFile();
		const c = YAML.safeLoad(f.toString()) as Config;
		c.e621.directory = path.resolve(c.e621.directory.replace(/\$ROOT/g, __dirname));

		return c;
	}

	static edit(values: DeepPartial<Config>) {
		const v = this.get();
		const c = { ...v, ...values };
		if (JSON.stringify(v) === JSON.stringify(c)) return;
		fs.writeFileSync(this.CONFIG_LOCATION, YAML.safeDump(c));
	}
}
