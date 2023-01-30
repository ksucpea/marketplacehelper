
let existing = {};

let interval;
let newItems = 0;

function getListings() {
    return () => {
        let visited = document.querySelector('div[aria-label="Collection of Marketplace items"]').querySelectorAll('a.bfbm-visited');
        let listings = document.querySelector('div[aria-label="Collection of Marketplace items"]').querySelectorAll('a');
        if (visited.length === listings.length) return;

        const num = visited.length;
        var isItem = listings[num].href && listings[num].href.includes("/marketplace/item/");
        const id = isItem ? listings[num].href.split("/marketplace/item/")[1].split("/")[0] : -1;
        if (isItem) {
            console.log(existing);
            if (existing[id] && existing[id].updated === true) {
                listings[num].style.opacity = "33%";
            } else {
                listings[num].parentNode.style = "border: 2px solid #1b74e4; border-radius: 8px;transition:.2s padding;";
                newItems++;
                setTimeout(() => {
                    console.log(newItems, performance.now());
                    const mouseDownEvent = new PointerEvent('pointerdown', {
                        clientX: listings[num].getBoundingClientRect().left,
                        clientY: listings[num].getBoundingClientRect().top,
                        bubbles: true,
                        cancelable: true
                    });
                    listings[num].dispatchEvent(mouseDownEvent);
                    listings[num].parentNode.style.padding = "8px";
                }, newItems * 1000);
            }
        }
        listings[num].classList.add("bfbm-visited");
    }
}

function getPathname(path) {
    let first, last = "";
    let x = path.split(path.includes("/?") ? "/?" : "?");
    let y = path.split("query=");
    if (x.length > 1 && y.length > 1) {
        z = y[1].split("&");
        last = "?query=" + z[0];
    }
    first = x[0];
    return first.split("https://www.facebook.com/marketplace/category")[1] + last;
}

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message.type === "start") {
        newItems = 0;
        console.log("Recieved begin message");
        const path = getPathname(location.href);
        const isSold = location.href.includes("availability=out%20of%20stock");

        console.log(path, isSold ? "sold" : "available");

        chrome.storage.local.get([path, "bfbm-queries"], data => {
            let update = {};
            existing = {};
            if (data[path]) {
                existing = data[path][isSold ? "sold" : "available"];
            } else {
                let queries = [path];
                if (data["bfbm-queries"] && data["bfbm-queries"].length) {
                    queries = queries.concat(data["bfbm-queries"]);
                }
                update = { [path]: { "available": {}, "sold": {} }, "bfbm-queries": queries };
            }
            chrome.storage.local.set({ ...update }).then(() => {
                clearInterval(interval);
                interval = setInterval(getListings(path, isSold), 500);
                console.log("Interval set");
                chrome.storage.local.get(null, resp => console.log(resp));
            });
        });
    } else if (message.type === "pause") {
        clearInterval(interval);
    }
    sendResponse();
});