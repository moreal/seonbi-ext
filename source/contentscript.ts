import browser from "webextension-polyfill";

function init() {
    const bottoms = Array.from(document.querySelectorAll("article[data-testid=\"tweet\"]")).map(x => x.querySelectorAll("div[role=group]")[0]);
    const tweets = Array.from(document.querySelectorAll("article[data-testid=\"tweet\"]")).map(x => x.querySelectorAll("div[lang]")[0]);

    const bottomAndTweets = bottoms.map((bottom, index) => [bottom, tweets[index]]);

    for (const [bottom, tweet] of bottomAndTweets) {
        const button = document.createElement("button");
        button.innerText = "Seonbi";
        button.onclick = function () {
            browser.runtime.sendMessage({
                extensionId: browser.runtime.id,
                message: tweet.innerHTML
            }).then(({ resultHtml }) => {
                tweet.innerHTML = resultHtml;
            }).catch(alert);
        };
        button.className += " seonbi-button";
        if (bottom.querySelector(".seonbi-button") === null) {
            bottom.appendChild(button);
        }
    }
}

setInterval(() => {
    init();
}, 1000);
