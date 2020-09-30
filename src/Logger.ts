import * as fs from "fs-extra";
import ConfigManager from "./ConfigManager";

export default class Logger {
	private constructor() { }

	static log(loc: string, message: string | string[]) { return this._log("log", loc, message); }
	static info(loc: string, message: string | string[]) { return this._log("info", loc, message); }
	static debug(loc: string, message: string | string[]) { return this._log("debug", loc, message); }
	static error(loc: string, message: string | string[]) { return this._log("error", loc, message); }
	static warn(loc: string, message: string | string[]) { return this._log("warn", loc, message); }

	private static _log(type: string, loc: string, messages: string | string[]) {
		if (!(messages instanceof Array)) messages = [messages];
		const f = ConfigManager.get().logFile;
		const d = new Date();
		const format = ((type: string, d = new Date()) => `[${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}][${d.toString().split(" ")[4]}][${type.toUpperCase()}][${loc}]`);
		fs.appendFileSync(f, `${format(type, d)}: ${messages.join(" ")}\n`);
		console.log(format(type, d), ":", ...messages);
	}
}
