import * as core from "@actions/core";
import * as cache from "@actions/cache";
import { hashAll } from "./util.js";
async function post() {
    const cacheDirsJson = core.getState("CACHE_DIRS");
    if (!cacheDirsJson)
        return;
    const cacheDirs = JSON.parse(cacheDirsJson);
    const dubArgs = core.getState("DUB_ARGS");
    const cacheKey = `dub-package-cache-${process.platform}-${await hashAll(dubArgs)}`;
    try {
        await cache.saveCache(cacheDirs, cacheKey);
    }
    catch {
        console.log("Did not upload cache (probably already recent version)");
    }
}
post();
