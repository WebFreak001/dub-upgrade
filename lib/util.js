import * as glob from "@actions/glob";
import * as fs from "fs";
import * as path from "path";
import { createHash } from "crypto";
export function hash(data) {
    const shasum = createHash("sha1");
    shasum.update(data);
    return shasum.digest("base64");
}
export async function hashAll(data) {
    const globber = await glob.create("**/dub.selections.json");
    for await (const file of globber.globGenerator()) {
        data += "\n" + hash(fs.readFileSync(file).toString());
    }
    const shasum = createHash("sha1");
    shasum.update(data);
    return shasum.digest("base64");
}
export function getDubPackagesDirectory() {
    switch (process.platform) {
        case "linux":
        case "freebsd":
        case "openbsd":
        case "netbsd":
        case "darwin":
        case "android":
        case "sunos":
        case "aix": {
            const home = process.env["HOME"];
            if (home) {
                return path.join(home, ".dub", "packages");
            }
            else {
                console.warn("Package cache not supported: could not find HOME variable");
                return null;
            }
        }
        case "win32": {
            const appdata = process.env["LOCALAPPDATA"];
            if (appdata) {
                return path.join(appdata, "dub", "packages");
            }
            else {
                console.warn("Package cache not supported: could not find LOCALAPPDATA variable");
                return null;
            }
        }
        default:
            console.warn("Package cache not supported: unknown platform " + process.platform);
            return null;
    }
}
export function parseBool(input) {
    if (input)
        return (input === "true" || input === "yes" || input === "on" || input === true);
    else
        return false;
}
