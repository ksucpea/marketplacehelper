
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
    container.style = "color:#fff;font-size:14px;position: fixed; top: 0; left: 0; height: 100vh; width: 100vw; background: #000000bd; z-index: 10; display: flex; align-items: center; justify-content: center;";
    container.id = "mh-overlay";
    document.body.appendChild(container);
    container.innerHTML = '<div class="mh-overlay-inner" style="max-width: 400px;min-width: 400px;min-height:60vh;max-height:60vh"></div>';
}

/*

function setNextOverlayItem(items = null) {
    console.log("setNextOverlayItem()");
    let el = document.querySelector(".mh-overlay-inner");
    let el2 = document.querySelector('div[aria-label="Collection of Marketplace items"]');
    let visited = el2.querySelectorAll('a.bfbm-visited');
    let listings = el2.querySelectorAll('a');
    el.textContent = "";
    if (items === null) {
        el.textContent = "Scroll to continue searching for new items";
    } else {
        let str = "";
        //const max = (items.length > 3 ? 3 : items.length);
        const max = items.length;
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
*/
/*
async function getListings2() {
    
    const data = await chrome.storage.local.get("saved");
    let pathnames;
    for (let i = 0; i < data["saved"].length; i++) {
        console.log(data["saved"][i]);
        if (data["saved"][i].name === currentName) {
            pathnames = data["saved"][i].pathnames;
            break;
        }
    }
    const storage = await chrome.storage.local.get(pathnames);
    let existing = {};
    pathnames.forEach(pathname => {
        existing = { ...data, ...storage[pathname] };
    });
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
        //listing.classList.add("bfbm-visited");
    }
    console.log(queue);
    
}
*/

async function markSeen() {
    const data = await chrome.storage.local.get("saved");
    let pathnames;
    for (let i = 0; i < data["saved"].length; i++) {
        if (data["saved"][i].name === currentName) {
            pathnames = data["saved"][i].pathnames;
            break;
        }
    }
    const storage = await chrome.storage.local.get(pathnames);
    let existing = {};
    pathnames.forEach(pathname => {
        existing = { ...data, ...storage[pathname] };
    });
    let el = document.querySelector('div[aria-label="Collection of Marketplace items"]');
    const queue = el.querySelectorAll("a:not(.bfbm-visited, .bfbm-seen)");

    let queueText = "";
    let queueLength = 0;
    queue.forEach(item => {
        if (item.href && item.href.includes("/marketplace/item/")) {
            const id = item.href.split("/marketplace/item/")[1].split("/")[0];
            if (existing[id]) {
                item.classList.add("bfbm-seen");
                item.style.opacity = "33%";
            } else {
                queueText += `<p>${item.querySelector("img").alt}</p>`;
                queueLength++;
            }
        } else {
            item.classList.add("bfbm-seen");
        }
    });
    if (queueText === "") {
        document.querySelector(".mh-overlay-inner").textContent = "Scroll to continue queueing items";
    } else {
        document.querySelector(".mh-overlay-inner").innerHTML = `<p>${queueLength} in queue:</p>` + queueText;
    }
}

async function checkQueue() {
    await markSeen();

    const el = document.querySelector('div[aria-label="Collection of Marketplace items"]');
    const queue = el.querySelectorAll("a:not(.bfbm-visited, .bfbm-seen)");

    const listing = queue[0];
    var isItem = listing.href && listing.href.includes("/marketplace/item/");
    if (isItem) {
        const id = listing.href.split("/marketplace/item/")[1].split("/")[0];
        if (existing[id]) {
            listing.classList.add("bfbm-seen");
            listing.style.opacity = "33%";
        } else {
            simulateClick(listing);
        }
    }
    listing.classList.add("bfbm-visited");
}

function simulateClick(element) {
    if (!element) return;
    const mouseDownEvent = new PointerEvent('pointerdown', {
        clientX: element.getBoundingClientRect().left,
        clientY: element.getBoundingClientRect().top,
        bubbles: true,
        cancelable: true
    });
    element.dispatchEvent(mouseDownEvent);
    element.parentNode.style = "border: 2px solid #1b74e4;padding:8px; border-radius: 8px;transition:.2s padding;";
}

/*
function checkQueue2() {
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
        setNextOverlayItem(queue.length > 0 ? queue : null);
    } else {
        setNextOverlayItem(null);
    }
}
*/


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
        currentName = message.name;

        const path = getPathname(location.href);

        //const isSold = location.href.includes("availability=out%20of%20stock");

        chrome.storage.local.get([path, "settings"], data => {
            createOverlay();
            clearInterval(interval2);
            interval2 = setInterval(checkQueue, data.settings.delay);
        });

    } else if (message.type === "pause") {
        //clearInterval(interval);
        clearInterval(interval2);
        document.querySelector("#mh-overlay").style.zIndex = -1;
    }
    sendResponse();
});