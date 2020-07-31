"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const cache = __importStar(require("@actions/cache"));
const glob = __importStar(require("@actions/glob"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const which_1 = __importDefault(require("which"));
const crypto_1 = __importDefault(require("crypto"));
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const doCache = parseBool(core.getInput("cache", { required: false }));
            const onlyStore = parseBool(core.getInput("store", { required: false }));
            const dubArgs = core.getInput("args", { required: false }) || "";
            let dubPackagesDirectory;
            if (doCache) {
                dubPackagesDirectory = getDubPackagesDirectory();
            }
            else {
                dubPackagesDirectory = null;
            }
            if (doCache && !dubPackagesDirectory) {
                console.warn("Could not determine dub packages directory, not caching global packages!");
            }
            let cacheDirs;
            if (doCache) {
                const checker = yield glob.create("**/.dub", {
                    implicitDescendants: false
                });
                let files = yield checker.glob();
                if (files.length > 0) {
                    if (dubPackagesDirectory)
                        cacheDirs = [dubPackagesDirectory, "**/.dub"];
                    else
                        cacheDirs = ["**/.dub"];
                }
                else if (dubPackagesDirectory) {
                    cacheDirs = [dubPackagesDirectory];
                }
                else {
                    cacheDirs = null;
                }
            }
            else {
                cacheDirs = null;
            }
            function storeCache() {
                return __awaiter(this, void 0, void 0, function* () {
                    if (cacheDirs) {
                        console.log("Storing dub package cache");
                        let cacheKey = `dub-package-cache-${process.platform}-${yield hashAll(dubArgs, dubPackagesDirectory, onlyStore)}`;
                        try {
                            yield cache.saveCache(cacheDirs, cacheKey);
                        }
                        catch (e) {
                            console.log("Did not upload cache (probably already recent version)");
                        }
                    }
                });
            }
            if (onlyStore) {
                yield storeCache();
                return;
            }
            let dub = which_1.default.sync("dub", { nothrow: true });
            if (!dub)
                return core.setFailed("dub is not installed or was not found in PATH - try installing D using dlang-community/setup-dlang@v1 first!");
            let cacheKey = `dub-package-cache-${process.platform}-${hash(dubArgs)}`;
            console.log("cache dirs: ", cacheDirs);
            console.log("dub: ", dub);
            if (cacheDirs) {
                yield cache.restoreCache(cacheDirs, cacheKey, ["dub-package-cache-" + process.platform]);
            }
            yield dubUpgrade(dub, dubArgs);
            yield storeCache();
        }
        catch (e) {
            core.setFailed("dub upgrade failed: " + e.toString());
        }
    });
}
function dubUpgrade(dub, dubArgs) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("Running dub upgrade");
        if (!(yield execDubUpgrade(dub, dubArgs))) {
            console.log("Dub network failure, trying again in 30s...");
            yield delay(30000);
            if (!(yield execDubUpgrade(dub, dubArgs))) {
                console.log("Dub network failure, trying again in 90s...");
                yield delay(90000);
                if (!(yield execDubUpgrade(dub, dubArgs))) {
                    throw new Error("Failed to dub upgrade for 3 times in a row");
                }
            }
        }
    });
}
/**
 * Runs `dub upgrade` and returns `true` if success or `false` on network
 * failure. Throws exception in any other error case.
 *
 * @param dub Path to dub executable
 * @param dubArgs Additional dub shell arguments to append to dub upgade
 */
function execDubUpgrade(dub, dubArgs) {
    // I guess the dub path could contain spaces and break that way, but there
    // doesn't seem to be any escaping utility in the nodejs standard library,
    // so meh, quotes should be enough.
    let proc;
    try {
        proc = child_process_1.spawn('"' + dub + "\" upgrade " + dubArgs, { shell: true });
    }
    catch (e) {
        console.error("Failed starting dub");
        return Promise.reject(e);
    }
    return new Promise((resolve, reject) => {
        var _a, _b;
        let output = "";
        (_a = proc.stdout) === null || _a === void 0 ? void 0 : _a.on("data", (chunk) => {
            process.stdout.write(chunk.toString());
            output += chunk;
        });
        (_b = proc.stderr) === null || _b === void 0 ? void 0 : _b.on("data", (chunk) => {
            process.stderr.write(chunk.toString());
            output += chunk;
        });
        proc.on("close", (code) => {
            if (code == 0) {
                resolve(true);
            }
            else {
                if (output.indexOf("Error querying versions") != -1
                    || output.indexOf("Failed to download") != -1)
                    return resolve(false);
                else
                    return reject("dub exited with error code " + code);
            }
        });
    });
}
function hash(data) {
    const shasum = crypto_1.default.createHash('sha1');
    shasum.update(data);
    return shasum.digest("base64");
}
function hashAll(data, dubDir, buildCache) {
    var e_1, _a;
    return __awaiter(this, void 0, void 0, function* () {
        if (dubDir)
            data += "\n" + fs.readdirSync(dubDir).join("\n");
        const globber = yield glob.create("**/dub.selections.json");
        try {
            for (var _b = __asyncValues(globber.globGenerator()), _c; _c = yield _b.next(), !_c.done;) {
                const file = _c.value;
                data += "\n" + hash(fs.readFileSync(file).toString());
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (_c && !_c.done && (_a = _b.return)) yield _a.call(_b);
            }
            finally { if (e_1) throw e_1.error; }
        }
        if (buildCache)
            data += "\nput in build cache!";
        const shasum = crypto_1.default.createHash('sha1');
        shasum.update(data);
        return shasum.digest("base64");
    });
}
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function getDubPackagesDirectory() {
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
function parseBool(input) {
    if (input)
        return input === "true" || input === "yes" || input === "on" || input === true;
    else
        return false;
}
main();
