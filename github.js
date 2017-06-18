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

    function PKXRequestGitHub() {
        var self = this;

        this.process = function(selector) {
            if (selector.uri.authority.host != HOST_GITHUBAPI) {
                return;
            }

            return new Promise(function (resolve, reject) {
                var headers = { "user-agent": "allume" };
                var profile = typeof allume != "undefined"? allume.parameters.profile : {};
                if (profile.githubToken) {
                    headers["Authorization"] = "token " + profile.githubToken;
                }
                else if (profile.githubUsername) {
                    headers["Authorization"] = "Basic " + (profile.githubUsername + ":" + (profile.githubPassword? profile.githubPassword : "")).toBase64();
                }

                if (profile.githubEnableBranch) {
                    selector.uri = selector.repository + URI_PATH_GITHUBAPI_BRANCH_TEMPLATE + profile.githubEnableBranch;
                    resolve({"strip": 1, "headers" : headers});
                    return;
                }

                var uriReleases = selector.parseURI(selector.repository + URI_PATH_GITHUBAPI_RELEASES_TEMPLATE);

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
                            if (releases[r].prerelease && !profile.githubEnablePreReleases) {
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
                            reject(new Error("Package '" + selector.package + "' only has draft releases " + (profile.githubEnablePreReleases? "" : "and/or pre-releases ") + "in the GitHub repository."));
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

    var processor = new PKXRequestGitHub();
    define(function () {
        return processor;
    });

    var version = require("./cc.version");
    var string = require("./cc.string");
})();