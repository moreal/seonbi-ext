browser.runtime.onMessage.addListener(
    ({extensionId, message}, sender) => {
        const headers = new Headers();
        headers.append("Content-Type", "application/json");
        return fetch("https://seonbi.moreal.dev/", {
            method: "POST",
            body: JSON.stringify({
                sourceHtml: message,
                preset: "ko-kr",
            }),
            headers: headers,
            // mode: "no-cors",
            // credentials: "omit"
        }).then(resp => resp.json()).then(json => Promise.resolve(json)).catch(err => console.error(err));
        return false;
    }
);
