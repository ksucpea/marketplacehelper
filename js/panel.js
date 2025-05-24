let batchTimer;
let batch = {};
let requests = [];

const batchCount = 10;
const num_graph_sections = 13; // +1 (starts at 0)

const arrowSvg = '<svg class="item-arrow" viewBox="0 0 20 20" width="1em" height="1em"><path d="M10 14a1 1 0 0 1-.755-.349L5.329 9.182a1.367 1.367 0 0 1-.205-1.46A1.184 1.184 0 0 1 6.2 7h7.6a1.18 1.18 0 0 1 1.074.721 1.357 1.357 0 0 1-.2 1.457l-3.918 4.473A1 1 0 0 1 10 14z"></path></svg>';
const hideSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
const chevronDown = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';

function selectItemAvailability() {
    chrome.tabs.query({ active: true }, function (tabs) {
        ["#items-available", "#items-sold", "#items-all", "#items-hidden"].forEach(btn => {
            document.querySelector(btn).classList.remove("active");
        });

        if (tabs[0].url.includes("availability=out%20of%20stock")) {
            document.querySelector("#items-sold").classList.add("active");
        } else if (tabs[0].url.includes("bfbmAllItems=true")) {
            document.querySelector("#items-all").classList.add("active");
        } else if (tabs[0].url.includes("bfbmHidden=true")) {
            document.querySelector("#items-hidden").classList.add("active");
        } else {
            document.querySelector("#items-available").classList.add("active");
        }
    });
}

async function checkBatch() {
    const tabs = await chrome.tabs.query({ url: ["https://www.facebook.com/marketplace/*"] });
    const path = tabs[0].url;
    const storage = await chrome.storage.local.get(path);
    if (requests.length === 0) return;
    const availability = tabs[0].url.includes("availability=out%20of%20stock") ? "sold" : "available";
    const items = await processNewItems(availability);
    let existing = storage[path] ? storage[path] : {};
    let updatedData = { ...existing, ...items };

    chrome.storage.local.set({ [path]: updatedData }).then(() => {
        chrome.storage.local.get(path, storage => {
            console.log("CHECK BATCH RESULT!", storage);
        })
        document.querySelector(".batch-count").textContent = "refreshing";
        setTimeout(() => {
            document.querySelector(".batch-count").textContent = "";
        }, 2000);
        filterItems();
    });
}

function processNewItems(availability) {
    return new Promise((resolve, reject) => {
        let b = {};
        for (let i = 0; i < requests.length; i++) {
            requests[i].getContent(body => {
                try {
                    let parsed = JSON.parse(body);
                    let item = parsed?.data?.viewer?.marketplace_product_details_page?.target;
                    if (!item) return;

                    item.availability = availability;
                    item.hide = false;
                    if (item["can_buyer_make_checkout_offer"] !== undefined) {
                        item.negotiable = item.can_buyer_make_checkout_offer ? true : isItemNegotiable(item.marketplace_listing_title + " " + item.redacted_description.text);
                    }

                    console.log(item);

                    const properties = ["creation_time", "availability", "hide", "negotiable", "attribute_data", "listing_photos", "primary_listing_photo", "location", "listing_price", "is_shipping_offered", "formatted_shipping_price", "location_text", "marketplace_listing_title"];
                    const output = {};

                    for (const property of properties) {
                        if (item[property]) output[property] = item[property];
                    }

                    console.log("propertyies", item.id, output);


                    if (!b[item.id]) {
                        b[item.id] = { ...output, "updated": true };
                    } else {
                        b[item.id] = { ...b[item.id], ...output };
                    }

                    console.log(b);
                } catch (e) {
                    console.error("error parsing body");
                } finally {
                    if (i === requests.length - 1) {
                        requests = [];
                        console.log("sending", b);
                        resolve(b);
                    }
                }
            });
        }
    });
}

function createListing(item) {
    let div = document.createElement("div");
    div.classList.add("item-container");
    div.dataset.id = item.id;

    if (!item.listing_photos) {
        item.listing_photos = [{ "image": { "uri": item.primary_listing_photo.listing_image.uri } }]
    }

    div.innerHTML = `<div class="item-info">
                        <div style="display: flex;justify-content:space-between">
                            <div>
                                <div class="item-price">
                                    ${item?.listing_price?.formatted_amount_zeros_stripped} ${item?.negotiable ? " or offer" : ""}
                                </div>
                                ${item?.is_shipping_offered ? `<div>${item?.formatted_shipping_price}</div>` : ""}
                                <div>${convertTime(item.timeago)} ago </div>
                            </div>
                            <div class="hide-item">
                                ${hideSvg}
                            </div>
                        </div>
                        <div>
                            <div class="item-link" style="padding: 10px; margin: -10px;display: block; color: #fff;text-decoration:none">
                                <p style="margin: 0;font-size:14px;font-weight:700">${item.marketplace_listing_title}</p>
                                <p style="margin: 0;font-size:12px">${item.location_text.text} (${item.distance}mi)</p>
                            </div>
                        </div>
                    </div>
                    <img class="item-image image-active image-primary" data-imgnum="0" src="${item?.primary_listing_photo.listing_image?.uri}"></img>`;

    //document.querySelector(".items").appendChild(div);

    /* lazy load images */

    let lazyLoad = function () {
        let img = div.querySelector(".image-primary");
        if (!img.classList.contains("loaded")) {
            img.src = item.listing_photos[0].image.uri;
        }
        div.removeEventListener("click", lazyLoad);
    }

    div.addEventListener("click", lazyLoad);

    /* creating picture album */
    if (item.listing_photos.length > 1) {

        for (let i = 1; i < item.listing_photos.length; i++) {
            let img = document.createElement("img");
            img.classList.add("item-image");
            img.src = "data:,";
            img.dataset.imgnum = i;
            div.appendChild(img);
        }

        div.innerHTML += `<div class="item-arrow-left">${arrowSvg}</div><div class="item-arrow-right">${arrowSvg}</div>`;
        [".item-arrow-left", ".item-arrow-right"].forEach(arrow => {
            div.querySelector(arrow).addEventListener("click", () => {
                let current = div.querySelector(".image-active");
                let images = div.querySelectorAll(".item-image");
                let imgNum = parseInt(current.dataset.imgnum);
                current.classList.remove("image-active");
                let next;
                if (arrow === ".item-arrow-left") {
                    next = imgNum === 0 ? item.listing_photos.length - 1 : imgNum - 1;
                } else {
                    next = imgNum === item.listing_photos.length - 1 ? 0 : imgNum + 1;
                }
                if (images[next].src === "data:,") images[next].src = item.listing_photos[next].image.uri;
                images[next].classList.add("image-active");
            })
        });
    }

    /* event listeners */
    div.querySelector(".item-image").addEventListener("load", function (e) {
        e.target.parentNode.style.opacity = "100%";
        e.target.removeEventListener("load", this);
    });
    div.addEventListener("mouseover", () => {
        div.classList.add("hovered");
    });
    div.addEventListener("mouseleave", () => {
        div.classList.remove("hovered");
    });

    div.querySelector(".item-link").addEventListener("click", () => {
        chrome.tabs.create({ url: `https://facebook.com/marketplace/item/${item.id}` });
    });

    div.querySelector(".hide-item").addEventListener("click", () => {
        batch[item.id] = { ...item, hide: true };
        checkBatch();
        div.remove();
    });

    return div;
}



let currentItems = [];

function getSavedPathnames(save, data) {
    for (let i = 0; i < data["saved"].length; i++) {
        if (data["saved"][i].name === save) {
            return data["saved"][i].pathnames;
        }
    }
    return [];
}

async function filterItems() {
    const tabs = await chrome.tabs.query({ url: ["https://www.facebook.com/marketplace/*"] });
    const save = document.querySelector("#save-under").value;
    const saved = await chrome.storage.local.get("saved");
    let pathnames = getSavedPathnames(save, saved);
    const storage = await chrome.storage.local.get([...pathnames, "settings"]);

    const options = {
        "sort": document.querySelector("#sort").value,
        "direction": document.querySelector("#direction").value,
        "hideDistance": { "checked": document.querySelector("#hideDistance").checked, "radius": parseInt(document.querySelector("#hideDistanceVal").value) || 50 },
        "hideTimeOver": { "checked": document.querySelector("#hideTimeOver").checked, "days": parseFloat(document.querySelector("#hideTimeOverVal").value) || 1 },
        "hidePriceUnder": { "checked": document.querySelector("#hidePriceUnder").checked, "price": parseInt(document.querySelector("#hidePriceUnderVal").value) || 0 },
        "hidePriceOver": { "checked": document.querySelector("#hidePriceOver").checked, "price": parseInt(document.querySelector("#hidePriceOverVal").value) || 1000 },
        "beforeYear": { "checked": document.querySelector("#beforeYear").checked, "year": parseInt(document.querySelector("#beforeYearVal").value) || 2023 },
        "showNegotiable": { "checked": document.querySelector("#showNegotiable").checked },
        "explicitWords": { "checked": document.querySelector("#explicitWords").checked, "words": document.querySelector("#explicitWordsVal").value },
        "explicitWordsHide": { "checked": document.querySelector("#explicitWordsHide").checked, "words": document.querySelector("#explicitWordsHideVal").value },
        "hideEmojis": { "checked": document.querySelector("#hideEmojis").checked },
        "availability": tabs[0].url.includes("availability=out%20of%20stock") ? "sold" : "available",
        "lat": storage.settings.lat,
        "long": storage.settings.long,
    }

    // combine data
    let data = {};
    pathnames.forEach(pathname => {
        data = { ...data, ...storage[pathname] };
    });

    let keys = Object.keys(data);
    let toSort = [];
    let filtered = [];
    currentItems = [];
    let totalPrice = 0, totalAfterFilter = 0, low = 10000, high = 0;

    // setup items to be sorted
    keys.forEach(key => {
        if (totalAfterFilter >= storage["settings"]["max_items"]) return;
        const item = data[key];
        let allowAfterFilter = true;
        let xlat = parseFloat(item?.location?.latitude || 0), xlong = parseFloat(item?.location?.longitude || 0);
        let pythx = Math.sqrt(Math.pow(options.lat - xlat, 2) + Math.pow(options.long - xlong, 2));
        let prc = parseInt(item?.listing_price?.amount || 0);
        let distance = parseInt(pythx * 69);
        let now = (new Date().getTime()) / 1000;
        let timeago = now - item.creation_time;

        if (options.explicitWords.checked === true) {
            let words = options.explicitWords.words.split(",");
            let description = (" " + item.marketplace_listing_title + " " + item.redacted_description.text + " ").toLowerCase();
            let found = false;
            words.forEach(word => {
                if (word === "" || found === true) return;
                if (description.includes(" " + word.toLowerCase().trim() + " ")) {
                    found = true;
                }
            });
            allowAfterFilter = found;
        }

        if (options.explicitWordsHide.checked === true) {
            let words = options.explicitWordsHide.words.split(",");
            let description = (" " + item.marketplace_listing_title + " " + item.redacted_description.text + " ").toLowerCase();
            words.forEach(word => {
                if (word !== "") {
                    if (description.includes(word.toLowerCase())) {
                        allowAfterFilter = false;
                    }
                }
            });
        }

        if (options.hideEmojis.checked === true) {
            let description = (" " + item.marketplace_listing_title + " " + item.redacted_description.text + " ");
            if ((description.match(/([\uD800-\uDBFF][\uDC00-\uDFFF])/g))) allowAfterFilter = false;

        }

        if (options.beforeYear.checked === true) {
            let year = new Date(parseInt(options.beforeYear.year), 0);
            if ((item.marketplace_listing_seller.join_time * 1000) > year.getTime()) {
                allowAfterFilter = false;
            }
        }

        if ((options.hideDistance.checked === true && distance > options.hideDistance.radius) ||
            (options.hidePriceUnder.checked === true && prc <= options.hidePriceUnder.price) ||
            (options.hidePriceOver.checked === true && prc > options.hidePriceOver.price) ||
            (options.hideTimeOver.checked === true && timeago > (options.hideTimeOver.days * 24 * 60 * 60)) ||
            (options.showNegotiable.checked === true && item.negotiable === false) ||
            (options.availability === "available" && item.availability === "sold") ||
            (options.availability === "sold" && item.availability === "available") ||
            (item.hide === true)) {
            allowAfterFilter = false;
        }

        item.distance = distance;
        item.timeago = timeago;
        item.allowAfterFilter = allowAfterFilter;
        //toSort.push(data[key]);

        if (allowAfterFilter) {
            totalPrice += prc;
            if (low > prc) low = prc;
            if (high < prc) high = prc;
            totalAfterFilter++;
            filtered.push(item);
        }
    });

    // setting up graph
    let avg = parseInt(totalPrice / totalAfterFilter);
    document.querySelector("#avg-price").textContent = `Average: $${avg}`;
    let incr = (avg - low) / (num_graph_sections / 2);
    if ((incr * (num_graph_sections + 1)) > high) { // if the highest item is less than the increment
        incr = (high - low) / num_graph_sections;
    }

    // reset graph
    document.querySelectorAll(".graph-bars > div").forEach((sec, i) => {
        sec.querySelector(".bar").style.width = 0;
        sec.querySelector(".price").textContent = "$" + parseInt(low + (i * incr)) + (i === num_graph_sections ? "+" : "");
    });


    let sections = [];
    let max_section = 0;
    for (let i = 0; i <= num_graph_sections; i++) {
        sections[i] = 0;
    }

    filtered = filtered.sort(sortBy(options.sort, options.direction));

    for (const item of filtered) {
        let section = (parseInt(item?.listing_price?.amount) === 0 || parseInt(item?.listing_price?.amount) === low) && incr === 0 ? 0 : parseInt((parseInt(item?.listing_price?.amount) - low) / incr);
        if (section >= num_graph_sections) section = num_graph_sections;
        sections[section]++;
        if (sections[section] > sections[max_section]) {
            max_section = section;
        }
        try {
            const listing = createListing(item);
            currentItems.push(listing);
        } catch (e) {
            console.warn(e);
        }
    }


    /* determine the length of a single bar */
    /* the section with most items should span 100% of the graph */
    let bars = document.querySelector(".graph-bars");
    let percentage = 100 / sections[max_section];

    /* increase each bar section */
    for (let i = 0; i <= num_graph_sections; i++) {
        let bar = bars.querySelector(`div[data-incr="${i}"] > .bar`);
        bar.style.width = (sections[i] * percentage) + "%";
    }

    /* displaying indicators if there is no data */
    if (keys.length > 0) {
        document.querySelector("#no-items").style.display = "none";
        document.querySelector("#graph-no-data").style.display = "none";
        document.querySelector(".graph-bars").style.display = "block";
    } else {
        document.querySelector("#no-items").style.display = "block";
        document.querySelector("#graph-no-data").style.display = "block";
        document.querySelector("#avg-price").textContent = "Average: n/a";
        document.querySelector(".graph-bars").style.display = "none";
    }
    document.querySelector(".items-count").textContent = totalAfterFilter + " Items";

    display();
    return;
}

function getDimensions() {
    const items = document.querySelector(".items").getBoundingClientRect();
    const cols = Math.floor(items.width / 280);
    const height = items.width / cols;
    return { "height": height, "cols": cols }
}

const wh = window.innerHeight;
const gridGap = 10;

function renderItems(s = null) {
    const { height, cols } = getDimensions();
    const scrollTop = document.body.scrollTop;
    const start = s ? s : (Math.floor(scrollTop / height) * cols);
    const begin = document.createDocumentFragment();
    const numItems = Math.ceil(wh / height) * cols;
    const end = start + numItems + (2 * cols);

    for (let i = start; i < end; i++) {
        if (i >= currentItems.length) break;
        begin.appendChild(currentItems[i]);
    }
    document.querySelector(".items").innerHTML = "";
    document.querySelector(".items").appendChild(begin);
    document.querySelector(".items").style.top = (Math.floor(start / cols) * height) + "px";
    document.querySelector(".items-scroll").style.height = ((currentItems.length / cols) * height) + "px";

}

function display() {
    renderItems(0);
    document.onscroll = renderItems;
}

/*
function display222(startIndex = 0) {

    console.log("displaying...", currentItems);

    ih = getCurrentItemHeight();

    document.querySelector(".items-scroll").style.height = ((currentItems.length / numCols) * ih) + "px";

    let begin = document.createDocumentFragment();

    const numItems = Math.ceil(wh / ih) * numCols;

    for (let i = startIndex; i < numItems + numCols; i++) {

        if (i >= currentItems.length) break;

        let container = document.createElement("div");
        container.classList.add("item");
        container.appendChild(currentItems[i]);

        begin.appendChild(container);
    }


    document.querySelector(".items").innerHTML = "";
    document.querySelector(".items").appendChild(begin);

    let items = document.querySelectorAll(".item");




    const virtualScroll = () => {
        const scrollTop = document.body.scrollTop;
        var maxScroll = ((currentItems.length / numCols) * ih) - wh;

        let x = Math.floor(scrollTop / ih);
        let y = (x * ih);


        const start = Math.min(Math.floor((scrollTop / ih)) * numCols);
        if (start === prev || scrollTop >= maxScroll) return;

        document.querySelector(".items").style.top = y + "px";

        renderItems(start);

        for (var j = 0; j < numItems + numCols; j++) {
            if (j + start > currentItems.length - 1) return;
            const item = currentItems[j + start];
            items[j].innerHTML = "";
            items[j].appendChild(item);
        }

        prev = start;

    }
    document.onscroll = virtualScroll;
    //document.addEventListener("scroll", virtualScroll);
}
*/

function pause() {
    sendMessage({ type: "pause" });
    document.getElementById("pause").classList.add("active");
    document.getElementById("start").classList.remove("active");
}

function reset() {
    document.querySelector(".items").textContent = "";
}

/*
function collectMarketplace() {
    document.querySelector(".results").querySelectorAll(".cl-search-result").forEach(item => {

    });
}

function collectCraigslist() {

}
*/

/*
function refresh() {
    let urls = [/*"https://washingtondc.craigslist.org/search/college-park-md/sss?lat=38.976&lon=-76.9482&search_distance=8.3#search=1~gallery~0~0","https://www.facebook.com/marketplace/category/recently-posted?deliveryMethod=local_pick_up&sortBy=creation_time_descend&exact=true"];
    console.log(urls);
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        chrome.tabs.update(tabs[0].id, { url: tabs[0].url === urls[0] ? urls[1] : urls[0] }).then(() => {
            console.log("tab");
            if (tabs[0].url === urls[0]) {
                collectCraigslist();
            } else if (tabs[0].url === urls[1]) {
                collectMarketplace();
            }
        });
    });
}
*/

let refreshInterval;

const loadSettings = async (callback = () => { }) => {
    const tabs = await chrome.tabs.query({ url: ["https://www.facebook.com/marketplace/*"] });
    const storage = await chrome.storage.local.get(["settings", "saved"]);

    document.querySelector("#long").value = storage.settings.long;
    document.querySelector("#lat").value = storage.settings.lat;
    document.querySelector("#delay").value = storage.settings.delay;
    document.querySelector("#max_items").value = storage.settings.max_items;


    if (!storage.saved || storage.saved.length === 0) {

    } else {
        let set = false;
        document.querySelector("#save-under").textContent = "";
        storage.saved.forEach(item => {
            let selected = "";
            if (set === false) {
                item.pathnames.forEach(path => {
                    if (tabs[0].url === path) {
                        document.querySelector("#save-under").value = item.name;
                        selected = "selected";
                        set = true;
                        filterItems();
                    }
                })
            }
            document.querySelector("#save-under").innerHTML += '<option value="' + item.name + '"' + selected + '>' + item.name + '</option>';
        });

        const searches = document.querySelector(".searches");
        searches.textContent = "";
        storage.saved.forEach(item => {
            let container = document.createElement("div");
            container.className = "saved-search";
            container.innerHTML = `<div class="search-drop-btn"><p class="search-title">${item.name}</p><div>${chevronDown}</div></div><div class="search-queries"></div>`;
            item.pathnames.forEach(path => {
                let link = document.createElement("p");
                link.className = "search-link";
                link.textContent = path;
                link.addEventListener("click", () => {
                    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                        chrome.tabs.update(tabs[0].id, { url: path });
                    });
                });
                container.querySelector(".search-queries").prepend(link);
            });
            container.querySelector(".search-drop-btn").addEventListener("click", () => {
                container.querySelector(".search-queries").classList.toggle("open");
            })
            searches.appendChild(container);
        });


    }
    callback();
}

async function start() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const save = document.querySelector("#save-under").value;
    const storage = await chrome.storage.local.get("saved");

    // add the path under the saved search if not already
    for (let i = 0; i < storage["saved"].length; i++) {
        if (storage["saved"][i].name !== save) continue;
        if (!storage["saved"][i].pathnames.includes(tabs[0].url)) {
            storage["saved"][i].pathnames.push(tabs[0].url);
            await chrome.storage.local.set({ "saved": storage["saved"] });
        }
        break;
    }

    sendMessage({ "type": "start", "name": save });
    document.getElementById("start").classList.add("active");
    document.getElementById("pause").classList.remove("active");
}

document.addEventListener("DOMContentLoaded", function () {

    loadSettings(() => { updateResize(); filterItems() });
    batchTimer = setInterval(checkBatch, 5000);

    chrome.devtools.network.onRequestFinished.addListener((request) => {
        if (request.request && request.request.url && request.request.url.includes('https://www.facebook.com/api/graphql/')) {
            requests.push(request);
        }
    });

    selectItemAvailability();

    // new search is performed
    chrome.tabs.onUpdated.addListener((id, info, tab) => {
        if (tab.url.includes("https://www.facebook.com/marketplace/") && info.url && (info.url.includes("/search/") || info.url.includes("/category/"))) {
            selectItemAvailability();
            if (info.status === "loading") {
                batch = {};
                reset();
                pause();
                //checkBatch(true);
            } else if (info.status === "complete") {
                pause();
            }
        }
    });

    chrome.runtime.onMessage.addListener(function (request, sender, x) {
        if (request.type === "numListings") {
        } else if (request.type === "existingItem") {
            request.data.seen = true;
        }
    });

    // refilter after changing filters
    ["sort", "hideEmojis", "beforeYear", "beforeYearVal", "direction", "hideDistance", "hideDistanceVal", "hideTimeOver", "hidetimeOverVal", "hidePriceUnder", "hidePriceUnderVal", "hidePriceOver", "hidePriceOverVal", "showNegotiable", "explicitWords", "explicitWordsVal", "explicitWordsHide", "explicitWordsHideVal"].forEach(filter => {
        document.querySelector("#" + filter).addEventListener("change", () => {
            filterItems();
        });
    });

    // send start message to content script
    document.querySelector("#start").addEventListener("click", start);

    // send pause message to content script
    document.querySelector("#pause").addEventListener("click", pause);

    // not working
    document.querySelector("#items-available").addEventListener("click", function (e) {
        chrome.storage.local.set({ "bfbm-params": { ...storage["bfbm-params"], "availability": "available" } }).then(() => {
            e.target.classList.add("active");
            document.querySelector("#items-sold").classList.remove("active");
            reset();
            checkBatch();
        });
    });

    // not working
    document.querySelector("#items-sold").addEventListener("click", function (e) {
        chrome.storage.local.set({ "bfbm-params": { ...storage["bfbm-params"], "availability": "sold" } }).then(() => {
            e.target.classList.add("active");
            document.querySelector("#items-available").classList.remove("active");
            reset();
            checkBatch();
        });
    });

    // not working
    document.querySelector("#items-hidden").addEventListener("click", () => {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            chrome.tabs.update(tabs[0].id, { url: tabs[0].url + (tabs[0].url.includes("?") ? "&" : "?") + "bfbmHidden=true" }).then(() => {

            });
        });
    });

    // setting inputs
    document.querySelector("#lat").addEventListener("change", function (e) {
        chrome.storage.local.get("settings", storage => {
            chrome.storage.local.set({ "settings": { ...storage.settings, "lat": parseFloat(e.target.value) } });
        })
    });

    document.querySelector("#long").addEventListener("change", function (e) {
        chrome.storage.local.get("settings", storage => {
            chrome.storage.local.set({ "settings": { ...storage.settings, "long": parseFloat(e.target.value) } });
        })
    });

    document.querySelector("#delay").addEventListener("change", function (e) {
        chrome.storage.local.get("settings", storage => {
            chrome.storage.local.set({ "settings": { ...storage.settings, "delay": parseFloat(e.target.value) } });
        })
    });

    document.querySelector("#max_items").addEventListener("change", function (e) {
        chrome.storage.local.get("settings", storage => {
            chrome.storage.local.set({ "settings": { ...storage.settings, "max_items": parseFloat(e.target.value) } });
        })
    });

    document.querySelector("#create-save").addEventListener("click", createSave);
    document.querySelector("#clear-save").addEventListener("click", clearSave);
    document.querySelector("#save-under").addEventListener("change", filterItems);
});

async function createSave() {
    const save = document.querySelector("#create-save-name").value;
    if (save === "") return;
    const storage = await chrome.storage.local.get("saved");
    let existing = storage["saved"] ? storage["saved"] : [];
    if (existing.some(x => x.name === save)) return;
    existing.push({ "name": save, "pathnames": [] });
    await chrome.storage.local.set({ "saved": existing });
    loadSettings(() => {
        document.querySelector("#save-under").value = save;
        document.querySelector("#save-under").querySelector("option[value=" + save + "]").selected = true;
        filterItems();
    });
}

async function clearSave() {
    const save = document.querySelector("#clear-save-name").value;
    if (save === "") return;
    const storage = await chrome.storage.local.get("saved");
    const existing = storage["saved"] ? storage["saved"] : [];

    const wiped = {};
    for (let i = 0; i < existing.length; i++) {
        if (existing[i]["name"] !== save) continue;
        existing[i]["pathnames"].forEach(path => {
            wiped[path] = {};
        });
        existing["pathnames"] = [];
    }

    await chrome.storage.local.set({ ...wiped, "saved": existing });
    loadSettings(() => {
        document.querySelector("#save-under").value = save;
        document.querySelector("#save-under").querySelector("option[value=" + save + "]").selected = true;
        filterItems();
    });
}

// helpers

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

function isItemNegotiable(description) {
    description = description.toLowerCase();
    if (description.includes("best offer") || description.includes("negotiable") || description.includes(" obo") || description.includes("willing to negotiate")) {
        return true;
    }
    return false;
}

function sendMessage(message) {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        chrome.tabs.sendMessage(tabs[0].id, message, function (response) {
            //console.log(response);
        });
    });
}

function sortBy(sort, direction) {
    console.log(sort, direction);
    switch (sort) {
        case "time":
            return (a, b) => {
                let x = parseInt(a.creation_time), y = parseInt(b.creation_time);
                //return x > y ? -1 : x < y ? 1 : 0;
                return direction === "dec" ? (x < y ? -1 : 1) : (x > y ? -1 : 1);
            }
        case "price":
            return (a, b) => {
                let x = parseInt(a.listing_price.amount), y = parseInt(b.listing_price.amount);
                return direction === "dec" ? (x > y ? -1 : 1) : (x < y ? -1 : 1);
            }
        case "distance":
            const lat = document.querySelector("#lat").value;
            const long = document.querySelector("#long").value;
            return (a, b) => {
                let xlat = parseFloat(a?.location?.latitude || 0), xlong = parseFloat(a?.location?.longitude || 0), ylat = parseFloat(b?.location?.latitude || 0), ylong = parseFloat(b?.location?.longitude || 0);
                let pythx = Math.pow(lat - xlat, 2) + Math.pow(long - xlong, 2);
                let pythy = Math.pow(lat - ylat, 2) + Math.pow(long - ylong, 2);
                //console.log(pythx + " < " + pythy);
                return pythx < pythy ? -1 : 1;
            }
    }
}

function convertTime(time) {
    let unit = "seconds";
    if (time > 60) {
        unit = "minutes";
        time /= 60;
        if (time > 60) {
            unit = "hours";
            time /= 60;
            if (time > 24) {
                unit = "days";
                time /= 24;
            }
        }
    }
    return parseInt(time) + " " + unit;
}