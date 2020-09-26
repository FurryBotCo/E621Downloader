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
	private static LOCATION = path.resolve(`${__dirname}/../config.yaml`);
	static loadFile() { return fs.readFileSync(this.LOCATION); }

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
		fs.writeFileSync(this.LOCATION, YAML.safeDump(c));
	}
}
