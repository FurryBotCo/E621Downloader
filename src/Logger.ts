import * as fs from "fs-extra";
import ConfigManager from "./ConfigManager";

type MessageType = string | string[];

export default class Logger {
	private constructor() { }

	static log(loc: string, message: MessageType) { return this._log("log", loc, message); }
	static info(loc: string, message: MessageType) { return this._log("info", loc, message); }
	static debug(loc: string, message: MessageType) { return this._log("debug", loc, message); }
	static error(loc: string, message: MessageType) { return this._log("error", loc, message); }
	static warn(loc: string, message: MessageType) { return this._log("warn", loc, message); }

	private static _log(type: string, loc: string, messages: MessageType) {
		console.log("1");
		if (!(messages instanceof Array)) messages = [messages];
		console.log("2");
		const f = ConfigManager.get().logFile;
		console.log("3");
		const d = new Date();
		console.log("4");
		const format = ((type: string, d = new Date()) => `[${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}][${d.toString().split(" ")[4]}][${type.toUpperCase()}][${loc}]`);
		console.log("5");
		fs.appendFileSync(f, `${format(type, d)}: ${messages.join(" ")}\n`);
		console.log("6");
		console.log(`${format(type, d)}:`, ...messages);
		console.log("7");
	}
}
