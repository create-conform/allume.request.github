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
                    ghConf = profile.github;
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

                        var release = version.find(versions, selector.package, selector.upgradable || version.UPGRADABLE_PATCH);
                        if (!release) {
                            reject(new Error("Couldn't find any suitable release for package '" + selector.package + "' in the GitHub repository."));
                        }
                        else {
                            try {
                                selector.uri = release.tarball_url;
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
})();