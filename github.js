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
    var URI_PATH_GITHUBAPI_RELEASES_TEMPLATE = "$NAME/releases";
    var URI_PATH_GITHUBAPI_BRANCH_TEMPLATE = "$NAME/tarball/";
    var PATH_CACHE = "allume.request.github/cache/";
    var EXT_PKX = "pkx";

    function AllumeRequestGitHub() {
        var self = this;

        this.process = function(selector) {
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
                    selector.uri = selector.repository.url + URI_PATH_GITHUBAPI_BRANCH_TEMPLATE + ghBranch;
                    resolve({"strip": 1, "headers": headers});
                    return;
                }

                var uriReleases = selector.parseURI(selector.repository.url + URI_PATH_GITHUBAPI_RELEASES_TEMPLATE);

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
                            versions[selector.name + "." + tagName] = releases[r];
                            count++;
                        }
                        if (count == 0) {
                            reject(new Error("Package '" + selector.package + "' only has draft releases " + (ghEnablePreRelease? "" : "and/or pre-releases ") + "in the GitHub repository."));
                            return;
                        }

                        var release = version.find(versions, selector.package, selector.upgradable || version.UPGRADABLE_NONE);
                        if (ghConf.enableCache) {
                            config.query(PATH_CACHE + selector.package + "*." + EXT_PKX).then(function(uriList) {
                                var cache = version.sort(uriList);

                                // get highest version from cache
                                var highestCache = version.find(cache, selector.package, selector.upgradable || version.UPGRADABLE_NONE);

                                if (!release) {
                                    // resolve highest cache version
                                    resolveURI(highestCache);
                                }
                                else {
                                    var found;
                                    for (var u in uriList) {
                                        var lastIdx = u.lastIndexOf("/");
                                        if (lastIdx < 0) {
                                            continue;
                                        }
                                        var fileName = u.substr(lastIdx + 1);
                                        if (fileName == id + "." + EXT_PKX) {
                                            found = u;
                                            break;
                                        }
                                    }
                                    if (found) {
                                        // release version from github is present in cache
                                        resolveURI(found);
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
                                            config.getVolume().then(function(cacheVolume) {
                                                cacheURI = cacheVolume.getURI(PATH_CACHE + id + "." + EXT_PKX);
                                                io.URI.open(cacheURI, io.ACCESS_OVERWRITE, true).then(function(cacheStream) {
                                                    function cacheFail() {
                                                        cacheStream.close().then(repoFail, repoFail);
                                                    }
                                                    function cacheResolve() {
                                                        resolveURI(cacheURI);
                                                    }
                                                    repoStream.copyTo(cacheStream).then(function() {
                                                        cacheStream.close().then(function() {
                                                            repoStream.close().then(cacheResolve, cacheResolve);
                                                        }, cacheFail);
                                                    }, cacheFail);
                                                }, repoFail);
                                            }, resolveURI);
                                        }, resolveURI);
                                    }
                                }
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
                            else if (!uri) {
                                reject(new Error("Couldn't find any suitable release for package '" + selector.package + "' in the GitHub repository."));
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
                    }, reject);
                }, reject);
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
})();