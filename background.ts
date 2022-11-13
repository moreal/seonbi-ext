import browser from "webextension-polyfill";

browser.runtime.onMessage.addListener(
    (message, sender) => {
        const headers = new Headers();
        headers.append("Content-Type", "application/json");
        return fetch("https://seonbi.fly.dev/", {
            method: "POST",
            body: JSON.stringify({
                sourceHtml: message,
                preset: "ko-kr",
            }),
            headers: headers,
        }).then(async resp => {
            let json = await resp.json()
            console.log("JSON_CAPTURE", json);
            return json;
        }).then(json => {
            console.log(message, sender);
            console.log("JSON_CAPTURE", json);
            return Promise.resolve(json);
        }).catch(err => console.error(err));
    }
);

// Simple example showing how to inject.
// You can inject however you'd like to, doesn't have
// to be with chrome.tabs.onActivated
// chrome.tabs.onActivated.addListener((e) => {
//     console.log("TAB_ID", e.tabId);
//     chrome.scripting.executeScript(
//         {
//             target: {
//                 allFrames: true,
//                 tabId: e.tabId,
//             },
//             world: "MAIN", // MAIN in order to access the window object
//             func: init
//         },
//         () => {
//             console.log("Background script got callback after injection")
//         }
//     )
// })
