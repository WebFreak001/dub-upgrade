import * as core from "@actions/core";
import * as cache from "@actions/cache";
import * as fs from "fs";
import * as path from "path";
import { ChildProcess, spawn } from "child_process";
import which from "which";
import crypto from 'crypto';
import glob from "glob";

async function main(): Promise<void> {
	try {
		const doCache: boolean = parseBool(core.getInput("cache", { required: false }));
		const dubArgs: string = core.getInput("args", { required: false }) || "";

		let dubPackagesDirectory: string | null;
		if (doCache) {
			dubPackagesDirectory = getDubPackagesDirectory();
		} else {
			dubPackagesDirectory = null;
		}

		if (doCache && !dubPackagesDirectory) {
			console.warn("Could not determine dub packages directory, not caching global packages!");
		}

		let cacheDirs: string[] | null;
		if (doCache) {
			if (dubPackagesDirectory)
				cacheDirs = [dubPackagesDirectory, "*/.dub"];
			else
				cacheDirs = ["*/.dub"];
		} else {
			cacheDirs = null;
		}


		let dub = which.sync("dub", { nothrow: true });
		if (!dub)
			return core.setFailed("dub is not installed or was not found in PATH - try installing D using dlang-community/setup-dlang@v1 first!");

		let cacheKey = `dub-package-cache-${process.platform}-${hash(dubArgs)}`;

		console.log("cache dirs: ", cacheDirs);
		console.log("dub: ", dub);
		if (cacheDirs) {
			await cache.restoreCache(cacheDirs, cacheKey, ["dub-package-cache-" + process.platform]);
		}

		await dubUpgrade(dub, dubArgs);

		if (cacheDirs) {
			console.log("Storing dub package cache");
			cacheKey = `dub-package-cache-${process.platform}-${await hashAll(dubArgs, cacheDirs)}`;
			await cache.saveCache(cacheDirs, cacheKey);
		}
	} catch (e) {
		core.setFailed("dub upgrade failed: " + e.toString());
	}
}

async function dubUpgrade(dub: string, dubArgs: string): Promise<void> {
	console.log("Running dub upgrade");
	if (!await execDubUpgrade(dub, dubArgs)) {
		console.log("Dub network failure, trying again in 30s...");
		await delay(30000);

		if (!await execDubUpgrade(dub, dubArgs)) {
			console.log("Dub network failure, trying again in 90s...");
			await delay(90000);

			if (!await execDubUpgrade(dub, dubArgs)) {
				throw new Error("Failed to dub upgrade for 3 times in a row");
			}
		}
	}
}

/**
 * Runs `dub upgrade` and returns `true` if success or `false` on network
 * failure. Throws exception in any other error case.
 * 
 * @param dub Path to dub executable
 * @param dubArgs Additional dub shell arguments to append to dub upgade
 */
function execDubUpgrade(dub: string, dubArgs: string): Promise<boolean> {
	// I guess the dub path could contain spaces and break that way, but there
	// doesn't seem to be any escaping utility in the nodejs standard library,
	// so meh, quotes should be enough.
	let proc: ChildProcess;
	try {
		proc = spawn('"' + dub + "\" upgrade " + dubArgs, { shell: true });
	} catch (e) {
		console.error("Failed starting dub");
		return Promise.reject(e);
	}

	return new Promise((resolve, reject) => {
		let output = "";
		proc.stdout?.on("data", (chunk) => {
			process.stdout.write(chunk.toString());
			output += chunk;
		});
		proc.stderr?.on("data", (chunk) => {
			process.stderr.write(chunk.toString());
			output += chunk;
		});
		proc.on("close", (code) => {
			if (code == 0) {
				resolve(true);
			} else {
				if (output.indexOf("Error querying versions") != -1
					|| output.indexOf("Failed to download") != -1)
					return resolve(false);
				else
					return reject("dub exited with error code " + code);
			}
		});
	});
}

function hash(data: string): string {
	const shasum = crypto.createHash('sha1');
	shasum.update(data);
	return shasum.digest("base64");
}

function hashAll(data: string, dirs: string[]): string {
	for (let i = 0; i < dirs.length; i++) {
		const dir = dirs[i];
		data += "\n" + fs.readdirSync(dir).join("\n");
	}

	var files = glob.sync("**/dub.selections.json");
	for (let i = 0; i < files.length; i++) {
		const file = files[i];
		data += "\n" + hash(fs.readFileSync(file).toString());
	}

	const shasum = crypto.createHash('sha1');
	shasum.update(data);
	return shasum.digest("base64");
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function getDubPackagesDirectory(): string | null {
	switch (process.platform) {
		// posix
		case "linux":
		case "freebsd":
		case "openbsd":
		case "netbsd":
		case "darwin":
		case "android":
		case "sunos":
		case "aix":
			let home = process.env["HOME"];
			if (home) {
				return path.join(home, ".dub", "packages");
			}
			else {
				console.warn("Package cache not supported: could not find HOME variable");
				return null;
			}
		// windows
		case "win32":
			let appdata = process.env["LOCALAPPDATA"];
			if (appdata) {
				return path.join(appdata, "dub", "packages");
			}
			else {
				console.warn("Package cache not supported: could not find LOCALAPPDATA variable");
				return null;
			}
		default:
			console.warn("Package cache not supported: unknown platform " + process.platform);
			return null;
	}
}

function parseBool(input: any | undefined): boolean {
	if (input)
		return input === "true" || input === "yes" || input === "on" || input === true;
	else
		return false;
}

main();
