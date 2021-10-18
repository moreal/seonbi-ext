browser.runtime.onMessage.addListener(
    ({ message }) => {
        const headers = new Headers();
        headers.append("Content-Type", "application/json");
        return fetch("https://seonbi.moreal.dev/", {
            method: "POST",
            body: JSON.stringify({
                sourceHtml: message,
                preset: "ko-kr",
            }),
            headers: headers,
        }).then(resp => resp.json()).then(json => Promise.resolve(json)).catch(err => console.error(err));
    }
);
