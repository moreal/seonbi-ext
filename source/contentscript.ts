import browser from "webextension-polyfill";

function init() {
    const bottoms = Array.from(document.querySelectorAll("article[data-testid=\"tweet\"]")).map(x => x.querySelectorAll("div[role=group]")[0]);
    const tweets = Array.from(document.querySelectorAll("article[data-testid=\"tweet\"]")).map(x => x.querySelectorAll("div[lang]")[0]);

    const bottomAndTweets = bottoms.map((bottom, index) => [bottom, tweets[index]]);

    for (const [bottom, tweet] of bottomAndTweets) {
        const button = bottom.lastChild.cloneNode(true) as HTMLElement; // Expect Share icon
        const originalSvg = button.querySelector("svg");
        originalSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        originalSvg.setAttribute("fill", "currentColor");
        originalSvg.setAttribute("viewBox", "0 0 24 24");
        originalSvg.setAttribute("stroke", "currentColor");
        originalSvg.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />`;
        button.onclick = function () {
            browser.runtime.sendMessage({
                extensionId: browser.runtime.id,
                message: tweet.innerHTML
            }).then(({ resultHtml }) => {
                tweet.innerHTML = resultHtml;
            }).catch(alert);
        };

        button.classList.add("seonbi-button");
        if (bottom.querySelector(".seonbi-button") === null) {
            bottom.appendChild(button);
        }
    }
}

setInterval(() => {
    init();
}, 1000);
