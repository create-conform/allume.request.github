/////////////////////////////////////////////////////////////////////////////////////////////
//
// allume.request.github
//
//    PKX request module for fetching releases from GitHub.
//
// License
//    Apache License Version 2.0
//
// Copyright Nick Verlinden (info@createconform.com)
//
///////////////////////////////////////////////////////////////////////////////////////////// 

(function() {
    var REQUEST_PROC_NAME = "github";
    var HOST_GITHUBAPI = "api.github.com";
    var HOST_GITHUB = "github.com";
    var URI_PATH_CORS_PROXY = "https://cors-anywhere.herokuapp.com/";
    var URI_PATH_GITHUBAPI_RELEASES_TEMPLATE = "$NAME/releases";
    var URI_PATH_GITHUBAPI_BRANCH_TEMPLATE = "$NAME/tarball/";
    var PATH_CACHE = "allume.request.github/cache/";
    var EXT_PKX = "pkx";

    function AllumeRequestGitHub() {
        var self = this;

        this.process = function(selector) {
            var direct;
            var directRepo;
            var triedCORSProxy;

            if (selector.uri.authority.host == HOST_GITHUB) {
                selector.uri.authority.host = HOST_GITHUBAPI;
                direct = selector.uri.path.substr(selector.uri.path.lastIndexOf("/") + 1);
                directRepo = selector.uri.path.substr(0, selector.uri.path.lastIndexOf("/"));
                directRepo = directRepo.substr(directRepo.lastIndexOf("/") + 1);
                selector.uri.path = "/repos" + (selector.uri.path.lastIndexOf("/") == selector.uri.path.length - 1? selector.uri.path.substr(0, selector.uri.path.length - 2) : selector.uri.path);
            }
            if (selector.uri.authority.host != HOST_GITHUBAPI) {
                return;
            }

            return new Promise(function (resolve, reject) {
                var headers = { "user-agent": "allume" };

                // get active profile from config
                var profile = typeof allume != "undefined"? allume.config.profiles[allume.config.activeProfile] : {};

                var ghConf;
                if (profile.repositories[selector.repository.namespace] && profile.repositories[selector.repository.namespace].github) {
                    ghConf = profile.repositories[selector.repository.namespace].github;
                }
                else if (profile.github) {
                    ghConf = profile.github;
                }
                else if (typeof allume != "undefined" && allume.config && allume.config.github) {
                    ghConf = allume.config.github;
                }

                // setup github data
                var ghUsername = ghConf? ghConf.username : null;
                var ghPassword = ghConf? ghConf.password : null;
                var ghToken = ghConf? ghConf.token : null;
                var ghBranch = ghConf? ghConf.branch : null;
                var ghEnablePreRelease = ghConf? ghConf.enablePreRelease : null;
                var ghEnableCache = ghConf && ghConf.enableCache != null? ghConf.enableCache : true;

                if (ghToken) {
                    headers["Authorization"] = "token " + ghToken;
                }
                else if (ghUsername) {
                    headers["Authorization"] = "Basic " + (ghUsername + ":" + (ghPassword ? ghPassword : "")).toBase64();
                }

                if (ghBranch) {
                    if (!direct) {
                        selector.uri = selector.repository.url + URI_PATH_GITHUBAPI_BRANCH_TEMPLATE + ghBranch;
                    }
                    else {
                        selector.uri.path += "/tarball/" + ghBranch;
                    }
                    resolve({"strip": 1, "headers": headers});
                    return;
                }

                function ghDone(release) {
                    if (release instanceof Error) {
                        //console.error(release);
                        release = null;
                    }

                    // variable will contain error message when download of tarball url fails.
                    var releaseErr;

                    if (ghEnableCache) {
                        config.getVolume().then(function(cacheVolume) {
                            function cacheQueryDone(uriList) {
                                if (uriList && uriList.code == "ENOENT") {
                                    uriList = [];
                                }
                                else if (uriList && uriList.code) {
                                    console.error("Cache disk error.", uriList);
                                    resolveURI(release? release.tarball_url : null);
                                }
                                var cache = {};
                                for (var u in uriList) {
                                    if (uriList[u].path.lastIndexOf("/") != uriList[u].path.length - 1) {
                                        var file = uriList[u].path.substr(uriList[u].path.lastIndexOf("/") + 1);
                                        cache[file.substr(0,file.length - 4)] = uriList[u];
                                    }
                                }

                                // get highest version from cache
                                var highestCache = version.find(cache, direct? direct : selector.package, selector.upgradable || version.UPGRADABLE_NONE);

                                if (!release) {
                                    // resolve highest cache version
                                    resolveURI(highestCache);
                                }
                                else {
                                    var id = (direct? directRepo + "/" + direct : (selector.repository.namespace + (selector.repository.namespace != ""? "/" : "") + selector.name)) + "." + (release.tag_name.indexOf("v") == 0? release.tag_name.substr(1) : release.tag_name);
                                    var found;
                                    for (var u in cache) {
                                        if (u == ((direct? direct : selector.name) + "." + (release.tag_name.indexOf("v") == 0? release.tag_name.substr(1) : release.tag_name))) {
                                            found = u;
                                            break;
                                        }
                                    }
                                    if (found) {
                                        // release version from github is present in cache
                                        resolveURI(cache[found]);
                                    }
                                    else {
                                        // download new uri and save to cache
                                        io.URI.open(release.tarball_url).then(function(repoStream) {
                                            function repoFail() {
                                                repoStream.close().then(repoResolve, repoResolve);
                                            }
                                            function repoResolve() {
                                                resolveURI(release.tarball_url);
                                            };
                                            
                                            var cacheURI = cacheVolume.getURI(PATH_CACHE + id + "." + EXT_PKX);
                                            cacheURI.open(io.ACCESS_OVERWRITE, true).then(function(cacheStream) {
                                                function cacheDone(e) {
                                                    if (e instanceof Error) {
                                                        releaseErr = e;
                                                    }
                                                    cacheStream.close(releaseErr).then(function() {
                                                        repoStream.close().then(cacheResolve, cacheResolve);
                                                    }, cacheFail);
                                                }
                                                function cacheFail() {
                                                    cacheStream.close().then(repoFail, repoFail);
                                                }
                                                function cacheResolve() {
                                                    if (releaseErr) {
                                                        // an error occurred while downloading the tarrball (could be CORS), fallback to highest cached version.
                                                        resolveURI(highestCache);
                                                        return;
                                                    }
                                                    resolveURI(cacheURI);
                                                }
                                                repoStream.headers = headers;
                                                repoStream.copyTo(cacheStream).then(cacheDone, cacheDone);
                                            }, repoFail);
                                        }, resolveURI);
                                    }
                                }
                            }

                            cacheVolume.query(PATH_CACHE + (direct? (directRepo + "/") : (selector.repository.namespace + (selector.repository.namespace != ""? "/" : "")))).then(cacheQueryDone, cacheQueryDone);
                        }, function() {
                            // cache path error
                            resolveURI(release? release.tarball_url : null);
                        });
                    }
                    else {
                        resolveURI(release? release.tarball_url : null);
                    }

                    function resolveURI(uri) {
                        if (uri && uri.name) {
                            reject(new Error("An error occured while trying to fetch '" + selector.package + "' from the GitHub repository."));
                            return;
                        }
                        else if (!uri && !releaseErr) {
                            reject(new Error("Couldn't find any suitable release for package '" + selector.package + "' in the GitHub repository."));
                            return;
                        }
                        else if (!uri && releaseErr) {
                            if (!release || triedCORSProxy) {
                                reject(new Error("Downloading of package '" + selector.package + "' from GitHub failed. If you are running this in a browser, CORS might be the problem."));
                            }
                            else if (release) {
                                release.tarball_url = URI_PATH_CORS_PROXY + release.tarball_url;
                                triedCORSProxy = true;

                                ghDone(release);
                            }
                            return;
                        }
                        try {
                            selector.uri = uri;
                            resolve({"strip": 1, "headers" : headers});
                        }
                        catch (e) {
                            reject(e);
                        }
                    }
                }

                var uriReleases;
                if (direct) {
                    selector.uri.path += "/releases";
                    uriReleases = selector.uri;
                }
                else {
                    uriReleases = selector.parseURI(selector.repository.url + URI_PATH_GITHUBAPI_RELEASES_TEMPLATE);
                }

                uriReleases.open().then(function (stream) {
                    stream.headers = headers;
                    stream.readAsJSON().then(function (releases) {
                        if (!releases || releases.length == 0) {
                            reject(new Error("Package '" + selector.package + "' has no releases in the GitHub repository."));
                        }
                        var versions = [];
                        var count = 0;
                        for (var r in releases) {
                            if (releases[r].draft) {
                                continue;
                            }
                            if (releases[r].prerelease && !ghEnablePreRelease) {
                                continue;
                            }
                            var tagName = releases[r].tag_name;
                            if (tagName.substr(0,1) == "v") {
                                tagName = tagName.substr(1);
                            }
                            if (direct) {
                                versions[tagName] = releases[r];
                            }
                            else {
                                versions[selector.name + "." + tagName] = releases[r];
                            }
                            count++;
                        }
                        if (count == 0) {
                            reject(new Error("Package '" + selector.package + "' only has draft releases " + (ghEnablePreRelease? "" : "and/or pre-releases ") + "in the GitHub repository."));
                            return;
                        }

                        var release = version.find(versions, direct? "" : selector.package, selector.upgradable || version.UPGRADABLE_NONE);
                        
                        ghDone(release);
                    }, ghDone);
                }, ghDone);
            });
        };

        // register request processor
        define.Loader.waitFor("pkx", function(loader) {
            loader.addRequestProcessor(REQUEST_PROC_NAME, self.process);
        });
    }
    
    var processor = new AllumeRequestGitHub();
    define(function () {
        return processor;
    });

    var version = require("./cc.version");
    var string = require("./cc.string");
    var config = require("./cc.config");
    var io = require("./cc.io");
})();