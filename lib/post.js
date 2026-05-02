import * as core from "@actions/core";
import * as cache from "@actions/cache";
async function post() {
    const cacheDirsJson = core.getState("CACHE_DIRS");
    if (!cacheDirsJson)
        return;
    const cacheDirs = JSON.parse(cacheDirsJson);
    const cacheKey = core.getState("CACHE_KEY");
    try {
        await cache.saveCache(cacheDirs, cacheKey);
    }
    catch {
        console.log("Did not upload cache (probably already recent version)");
    }
}
post();
