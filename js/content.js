
let existing = {};
let interval;
let newItems = 0;
let queue = [];
let num_items_searched = 0;
let settings = {};
let currentName = "all";

document.addEventListener("DOMContentLoaded", () => {
    chrome.storage.local.get("settings", storage => {
        settings = storage.settings;
    });
});

function createOverlay() {

    let container = document.querySelector("#mh-overlay") || document.createElement("div");
    container.style = "color:#fff;font-size:14px;position: fixed; top: 0; left: 0; height: 100vh; width: 100vw; background: #000000f5; z-index: 10; display: flex; align-items: center; justify-content: center;";
    container.id = "mh-overlay";
    document.body.appendChild(container);
    container.innerHTML = '<div class="mh-overlay-inner" style="max-width: 400px;min-width: 400px;min-height:60vh;max-height:60vh"></div>';
    console.log(container);
    setNextOverlayItem();
}

function setNextOverlayItem(items = null) {
    console.log("setNextOverlayItem()");
    let el = document.querySelector(".mh-overlay-inner");
    let el2 = document.querySelector('div[aria-label="Collection of Marketplace items"]');
    let visited = el2.querySelectorAll('a.bfbm-visited');
    let listings = el2.querySelectorAll('a');
    el.textContent = "";
    if (items === null) {
        el.textContent = "Searching for new items...";
    } else {
        let str = "";
        //const max = (items.length > 3 ? 3 : items.length);
        const max = items.length;
        console.log("MAX !!! = " + max);
        el.innerHTML += "<p>" + items.length + " in queue</p>";
        for (let i = 0; i < max; i++) {
            const listing = items[i];
            var isItem = listing.href && listing.href.includes("/marketplace/item/");
            if (isItem) {
                //str += '<img style="display: block" src="' + listing.querySelector("img").src + '"></img>';
                str += '<p>' + listing.querySelector("img").alt + "</p>";
            }
        }
        el.innerHTML += str;
    }
}

function getListings2() {
    chrome.storage.local.get("saved", data => {
        let pathnames;
        for (let i = 0; i < data["saved"].length; i++) {
            console.log(data["saved"][i]);
            if (data["saved"][i].name === currentName) {
                pathnames = data["saved"][i].pathnames;
                break;
            }
        }
        chrome.storage.local.get(pathnames, storage => {
            let existing = {};
            pathnames.forEach(pathname => {
                console.log(storage[pathname]);
                existing = { ...data, ...storage[pathname] };
            });
            console.log(existing);
            let el = document.querySelector('div[aria-label="Collection of Marketplace items"]');
            let visited = el.querySelectorAll('a.bfbm-visited');
            let listings = el.querySelectorAll('a');
            if (visited.length === listings.length) return;

            for (let i = visited.length; i < listings.length; i++) {
                const listing = listings[i];
                var isItem = listing.href && listing.href.includes("/marketplace/item/");
                if (isItem) {
                    const id = isItem ? listing.href.split("/marketplace/item/")[1].split("/")[0] : -1;
                    if (existing[id]) {
                        listing.style.opacity = "33%";
                    } else {
                        queue.push(listing);
                    }
                }
                listing.classList.add("bfbm-visited");
            }
            console.log(queue);
        });
    })
}

function checkQueue() {
    console.log("checkQueue()");
    let current = queue.shift();
    if (current) {
        const mouseDownEvent = new PointerEvent('pointerdown', {
            clientX: current.getBoundingClientRect().left,
            clientY: current.getBoundingClientRect().top,
            bubbles: true,
            cancelable: true
        });
        current.dispatchEvent(mouseDownEvent);
        current.parentNode.style = "border: 2px solid #1b74e4;padding:8px; border-radius: 8px;transition:.2s padding;";
        /*
        if(++num_items_searched >= settings.max_items) {
            clearInterval(interval);
            clearInterval(interval2);
        }
        */
        setNextOverlayItem(queue.length > 0 ? queue : null);
    } else {
        setNextOverlayItem(null);
    }
}


function getPathname(path) {
    let first, last = "";
    if (path.includes("/search")) {
        first = path.split("/search")[1];
        let x = first.split(path.includes("/?") ? "/?" : "?");
        return x.length > 1 ? x[1].split("query=")[1].split("&")[0] : "unknown";
    } else if (path.includes("/category/")) {
        first = path.split("/category/")[1].split("/")[0];
        return first;
    } else {
        return "unknown";
    }
}

function beginAutomation() {

}

let interval2;

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    console.log(message);
    if (message.type === "start") {
        //beginAutomation();
        currentName = message.name;


        const path = getPathname(location.href);

        //const isSold = location.href.includes("availability=out%20of%20stock");

        chrome.storage.local.get([path, "settings"], data => {
            /*
            let update = {};
            existing = {};
            if (data[path]) {
                existing = data[path];
            } else {
                let queries = [path];
                if (data["bfbm-queries"] && data["bfbm-queries"].length) {
                    queries = queries.concat(data["bfbm-queries"]);
                }
                update = { [path]: {} };
            }
            */

            //chrome.storage.local.set({ ...update }).then(() => {
            console.log("lets go!");
            getListings2();
            createOverlay();
            clearInterval(interval);
            clearInterval(interval2);
            interval = setInterval(getListings2, 3000);
            interval2 = setInterval(checkQueue, data.settings.delay);
            //});

        });

    } else if (message.type === "pause") {
        clearInterval(interval);
        clearInterval(interval2);
        document.querySelector("#mh-overlay").style.zIndex = -1;
    }
    sendResponse();
});