/* globals md5 */
'use strict';

var lastfm = {
    // Default key and secret
    key: window.atob('M2VjNzY1MGEzZmE5MGY3ZGE3YWE5NmFjMzNmMTIzNjc='),
    secret: window.atob('NzExMzM5YzBjNTQ4ZDJiOWJiMmQ1ZWRmYzg5YzlmY2Q=')
};

lastfm.init = () => new Promise((resolve, reject) => {
    chrome.storage.local.get({
        userApiKey: "",
        userApiSecret: ""
    }, onGot => {
        if (onGot.userApiKey.length > 0) {
            Object.assign(lastfm, { key: window.atob(onGot.userApiKey) });
        }
        if (onGot.userApiSecret.length > 0) {
            Object.assign(lastfm, { secret: window.atob(onGot.userApiSecret) });
        }
        resolve(onGot);
    });
});

lastfm.fetch = obj => {
    // Remove all null object attributes
    Object.keys(obj).forEach((k) => ( obj[k] == null || obj[k] == "") && delete obj[k]);

    obj['api_key'] = lastfm.key;

    if (obj.method !== 'track.getInfo') {
        obj['api_sig'] = md5(Object.keys(obj).sort().map(k => k + obj[k]).join('') + lastfm.secret);
    }
    obj.format = 'json';

    const { sk, ...noSk } = obj;
    const sentVars = (obj.method !== 'track.getInfo') ? obj : noSk;

    const url = 'https://ws.audioscrobbler.com/2.0/?' +
        Object.entries(sentVars).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');

    return fetch(url, {
        method: 'POST'
    }).then(res => res.json());
};

lastfm.authenticate = () => new Promise((resolve, reject) => {
    lastfm.init().then(() => {
        const ru = chrome.identity.getRedirectURL('oauth.html');
        chrome.identity.launchWebAuthFlow({
            'url': 'https://www.last.fm/api/auth?api_key=' + lastfm.key +
                '&cb=' + encodeURIComponent(ru) +
                // a firefox mess!
                '&redirect_uri=' + encodeURIComponent(ru),
            'interactive': true
        }, url => {
            if (chrome.runtime.lastError || !url) {
                return reject(chrome.runtime.lastError || 'Empty response from chrome.identity.launchWebAuthFlow');
            }
            lastfm.fetch({
                method: 'auth.getSession',
                token: url.split('token=').pop().split('&').shift()
            }).then(json => {
                if (json && json.error) {
                    reject(json.message);
                } else if (json && json.session) {
                    chrome.storage.local.set({
                        session: json.session
                    }, resolve);
                }
            }).catch(reject);
        });
    });
});

lastfm.call = request => new Promise((resolve, reject) => {
    chrome.storage.local.get({
        session: null
    }, prefs => {
        if (prefs.session) {
            lastfm.fetch(Object.assign(request, {
                sk: prefs.session.key,
                username: prefs.session.name
            })).then(resolve, reject);
        } else {
            lastfm.authenticate()
                .then(() => lastfm.call(request).then(resolve, reject), reject);
        }
    });
});