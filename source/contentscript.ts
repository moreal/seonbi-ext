import browser from "webextension-polyfill";

function buildTranslationIcon(classList: string) {
  return `
  <svg xmlns="http://www.w3.org/2000/svg" class="${classList}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
  </svg>
  `
}

function init() {
    const bottoms = Array.from(document.querySelectorAll("article[data-testid=\"tweet\"]")).map(x => x.querySelectorAll("div[role=group]")[0]);
    const tweets = Array.from(document.querySelectorAll("article[data-testid=\"tweet\"]")).map(x => x.querySelectorAll("div[lang]")[0]);

    const bottomAndTweets = bottoms.map((bottom, index) => [bottom, tweets[index]]);

    for (const [bottom, tweet] of bottomAndTweets) {
        const button = document.createElement("button");
        button.innerText = "Seonbi";
        button.style.backgroundColor = "transparent";
        button.onclick = function () {
            browser.runtime.sendMessage({
                extensionId: browser.runtime.id,
                message: tweet.innerHTML
            }).then(({ resultHtml }) => {
                tweet.innerHTML = resultHtml;
            }).catch(alert);
        };
        const classList = Array.from(Array.from(bottom.getElementsByTagName("svg")).filter(x => x.classList.length === 8)[0].classList).join(" ");
        button.innerHTML = buildTranslationIcon(classList);
        button.className += " seonbi-button";
        if (bottom.querySelector(".seonbi-button") === null) {
            bottom.appendChild(button);
        }
    }
}

setInterval(() => {
    init();
}, 1000);
