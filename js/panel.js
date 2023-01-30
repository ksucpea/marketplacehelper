let batchTimer;
let batch = {};
const batchCount = 10;

const arrowSvg = '<svg class="item-arrow" viewBox="0 0 20 20" width="1em" height="1em" class="x1lliihq x1k90msu x2h7rmj x1qfuztq xcza8v6 xlup9mm x1kky2od"><path d="M10 14a1 1 0 0 1-.755-.349L5.329 9.182a1.367 1.367 0 0 1-.205-1.46A1.184 1.184 0 0 1 6.2 7h7.6a1.18 1.18 0 0 1 1.074.721 1.357 1.357 0 0 1-.2 1.457l-3.918 4.473A1 1 0 0 1 10 14z"></path></svg>';

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

function checkBatch(refresh = false) {
    chrome.tabs.query({ active: true }, function (tabs) {
        const path = getPathname(tabs[0].url);
        document.querySelector("#current-query").textContent = "Viewing: " + path;
        const isSold = tabs[0].url.includes("availability=out%20of%20stock");
        chrome.storage.local.get([path, 'bfbm-queries'], storage => {
            if (!storage[path]) {
                display({});
                let arr = storage["bfbm-queries"] && storage["bfbm-queries"].length ? storage["bfbm-queries"] : [];
                chrome.storage.local.set({ [path]: { "available": {}, "sold": {} }, "bfbm-queries": [path].concat(arr) });
                return;
            };
            if (storage['bfbm-queries'] && storage['bfbm-queries'].length > document.querySelectorAll(".previous-search").length) {
                document.querySelector(".searches").textContent = "";
                storage['bfbm-queries'].forEach(search => {
                    let btn = document.createElement("button");
                    btn.addEventListener("click", () => {
                        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                            chrome.tabs.update(tabs[0].id, { url: "https://www.facebook.com/marketplace/category" + search }).then(() => {

                            });
                        });
                    });
                    btn.textContent = search.includes("query=") ? search.split("query=")[1] : search;
                    document.querySelector(".searches").appendChild(btn);
                });
            }

            selectItemAvailability();

           let notUpdated  = {};
            Object.keys(batch).forEach(key => {
                if (key.updated === false) {
                    notUpdated[key] = {...batch[key]};
                }
            });
            
            let updatedData = {
                ...storage[path],
                [isSold ? "sold" : "available"]: {
                    ...storage[path][isSold ? "sold" : "available"],
                    ...batch
                }
            }
            chrome.storage.local.set({ [path]: updatedData }).then(() => {
                batch = notUpdated;

                let data;
                if (tabs[0].url.includes("bfbmHidden=true")) {
                    data = { ...updatedData["sold"], ...updatedData["available"] }
                    Object.keys(data).forEach(key => {
                        data[key].hide = !data[key].hide;
                    });
                } else if (tabs[0].url.includes("bfbmAllItems=true")) {
                    data = { ...updatedData["sold"], ...updatedData["available"] };
                } else {
                    data = updatedData[isSold ? "sold" : "available"];
                }

                display(data, refresh);
            });
        });
    });
}

function isItemNegotiable(description) {
    description = description.toLowerCase();
    if (description.includes("best offer") || description.includes("negotiable") || description.includes(" obo") || description.includes("willing to negotiate")) {
        return true;
    }
    return false;
}

async function detectNewItem(request) {
    request.getContent((body) => {
        if (request.request && request.request.url && request.request.url.includes('https://www.facebook.com/api/graphql/')) {
            try {
                let req = body.split('{"data":')[1].split(',"extensions":{')[0];
                let data = JSON.parse(req);
                if (data.node && data.node.__typename && data.node.__typename == "GroupCommerceProductItem") {
                    let x = data.viewer.marketplace_product_details_page.target;
                    x.hide = false;
                    x.negotiable = x.can_buyer_make_checkout_offer ? true : isItemNegotiable(x.marketplace_listing_title + " " + x.redacted_description.text);
                    if (!batch[x.id]) {
                        batch[x.id] = { ...x, "updated": true };
                    } else {
                        batch[x.id] = { ...batch[x.id], ...x };
                    }
                } else if (data.marketplace_search && data.marketplace_search.feed_units && data.marketplace_search.feed_units.edges) {
                    data.marketplace_search.feed_units.edges.forEach(edge => {
                        if (edge.node && edge.node.listing && edge.node.listing.__typename === "GroupCommerceProductItem") {
                            const listing = edge.node.listing;
                            console.log("listing", listing);
                            if (!batch[listing.id]) {
                                batch[listing.id] = { "default_photo": listing.primary_listing_photo.image.uri, "updated": false }
                            }
                        }
                    });
                }
            } catch (e) {
                let x = document.createElement("p");
                x.textContent = e;
                document.body.appendChild(x);
            }
        }
    });
}

function display(data, refresh = false) {
    let keys = Object.keys(data);
    document.querySelector("#no-items").style.display = keys.length > 0 ? "none" : "block";
    if (refresh === false && keys.length === document.querySelectorAll(".item-container").length) return;
    let options = {
        "sort": document.querySelector("#sort").value,
        "hideDistance": { "checked": document.querySelector("#hideDistance").checked, "radius": parseInt(document.querySelector("#hideDistanceVal").value) || 50 },
        "hideTimeOver": { "checked": document.querySelector("#hideTimeOver").checked, "days": parseFloat(document.querySelector("#hideTimeOverVal").value) || 1 },
        "hidePriceUnder": { "checked": document.querySelector("#hidePriceUnder").checked, "price": parseInt(document.querySelector("#hidePriceUnderVal").value) || 0 },
        "hidePriceOver": { "checked": document.querySelector("#hidePriceOver").checked, "price": parseInt(document.querySelector("#hidePriceOverVal").value) || 1000 },
        "showNegotiable": { "checked": document.querySelector("#showNegotiable").checked },
        "explicitWords": { "checked": document.querySelector("#explicitWords").checked, "words": document.querySelector("#explicitWordsVal").value },
        "explicitWordsHide": { "checked": document.querySelector("#explicitWordsHide").checked, "words": document.querySelector("#explicitWordsHideVal").value }
    }
    let toSort = [];
    let totalPrice = 0;
    let totalFilteredItems = 0;
    let low = 10000;
    let high = 0;
    keys.forEach(key => {
        let allowAfterFilter = true;
        let item = data[key];
        if (item.updated === true) {
            let xlat = parseFloat(item.location.latitude), xlong = parseFloat(item.location.longitude);
            let pythx = Math.sqrt(Math.pow(lat - xlat, 2) + Math.pow(long - xlong, 2));
            let prc = parseInt(item.listing_price.amount);
            let distance = parseInt(pythx * 69);
            let now = (new Date().getTime()) / 1000;
            let timeago = now - item.creation_time;

            if (options.explicitWords.checked === true) {
                let words = options.explicitWords.words.split(",");
                let description = (" " + item.marketplace_listing_title + " " + item.redacted_description.text + " ").toLowerCase();
                let found = false;
                words.forEach(word => {
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
                    if (description.includes(" " + word.toLowerCase().trim() + " ")) {
                        allowAfterFilter = false;
                    }
                });
            }

            if (options.hideDistance.checked === true && distance > options.hideDistance.radius) {
                allowAfterFilter = false;
            }
            if (options.hidePriceUnder.checked === true && prc <= options.hidePriceUnder.price) {
                allowAfterFilter = false;
            }
            if (options.hidePriceOver.checked === true && prc > options.hidePriceOver.price) {
                allowAfterFilter = false;
            }
            if (options.hideTimeOver.checked === true && timeago > (options.hideTimeOver.days * 24 * 60 * 60)) {
                allowAfterFilter = false;
            }
            if (options.showNegotiable.checked === true && item.negotiable === false) {
                allowAfterFilter = false;
            }

            item.distance = distance;
            item.timeago = timeago;
            item.allowAfterFilter = allowAfterFilter;
            toSort.push(data[key]);
            if (allowAfterFilter) {
                totalPrice += prc;
                if (low > prc) low = prc;
                if (high < prc) high = prc;
                totalFilteredItems++;
            }
        }
    });

    let avg = totalPrice / totalFilteredItems;
    document.querySelector("#avg-price").textContent = `Average: $${parseInt(avg)}`;
    let incr = (avg - low) / 6;
    if (incr * 13 > high) {
        incr = (high - low) / 12;
    }
    document.querySelectorAll(".graph > div").forEach((sec, i) => {
        sec.querySelector(".bar").style.width = 0;
        sec.querySelector(".price").textContent = "$" + parseInt(low + (i * incr)) + (i === 12 ? "+" : "");
    });

    let numItemsAfterFilter = 0;
    toSort.sort(sortBy(options.sort)).forEach((item, index) => {
        let itemEl;
        if (document.querySelector(`.item-container[data-id="${item.id}"`)) {
            itemEl = document.querySelector(`.item-container[data-id="${item.id}"`);
        } else {
            //console.log("item doesnt exist");
            let div = document.createElement("div");
            div.style = "color:" + (item.seen ? "inherit" : "red") + ';"';
            div.classList.add("item-container");
            div.dataset.id = item.id;
            div.innerHTML = `<div class="item-info"><div><div class="item-price">${item.listing_price.formatted_amount_zeros_stripped} ${item.negotiable ? " or offer" : ""}</div>${item.is_shipping_offered ? `<div>${item.formatted_shipping_price}</div>` : ""}<div>${convertTime(item.timeago)} ago </div></div> <div><div>${item.marketplace_listing_title}</div><div>${item.location_text.text} (${item.distance}mi)</div><div><a href="https://facebook.com/marketplace/item/${item.id}">link</a></div></div></div><img class="item-image image-active" data-imgnum="0" src=${item.primary_listing_photo.listing_image.uri}></img>`;
            for (let i = 1; i < item.listing_photos.length; i++) {
                let img = document.createElement("img");
                img.classList.add("item-image");
                img.src = "data:,";
                img.dataset.imgnum = i;
                div.appendChild(img);
            }
            document.querySelector(".items").appendChild(div);

            if (item.listing_photos.length > 1) {
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
            /*
            div.addEventListener("click", () => {
                batch[item.id] = {
                    ...item,
                    hide: true,
                }
                console.log(batch[item.id]);
            });*/
            itemEl = div;
        }
        document.querySelector(".items").insertBefore(itemEl, document.querySelectorAll(".item-container")[index]);
        //itemEl.style.display = (item.allowAfterFilter === false || item.hide === true) ? "none" : "block";
        if (item.allowAfterFilter === false || item.hide === true) {
            itemEl.style.display = "none";
        } else {
            itemEl.style.display = "block";
            numItemsAfterFilter++;
        }
        if (item.allowAfterFilter) {
            let section = parseInt(item.listing_price.amount) === 0 && incr === 0 ? 0 : parseInt((parseInt(item.listing_price.amount) - low) / incr);
            if (section >= 12) section = 12;
            let bar = document.querySelector(`.graph > div[data-incr="${section}"] > .bar`);
            bar.style.width = (parseInt(bar.style.width) + 10) + "px";
        }

    });
    document.querySelector(".items-count").textContent = numItemsAfterFilter + " Items";
}

const lat = 38.9822806;
const long = -76.9297769;
let sort = "time";

let items = [];
chrome.runtime.onMessage.addListener(function (request, sender, x) {
    if (request.type === "numListings") {
    } else if (request.type === "existingItem") {
        request.data.seen = true;
        detectNewItem(request);
    }
});

function getParams(url) {
    let query, availability;
    try {
        query = url.split("query=")[1].split("&")[0];
    } catch (e) {
        query = "none";
    }

    availability = url.includes("availability=out%20of%20stock") ? "sold" : "available";
    return { query, availability };
}

function pause() {
    sendMessage({ type: "pause" });
    document.querySelector("#pause").classList.add("active");
    document.querySelector("#start").classList.remove("active");
}

function reset() {
    document.querySelector(".items").textContent = "";
}

document.addEventListener("DOMContentLoaded", function () {

    checkBatch();
    batchTimer = setInterval(checkBatch, 5000);
    chrome.devtools.network.onRequestFinished.addListener(detectNewItem);

    /*
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        chrome.storage.local.set({ "bfbm-params": { ...getParams(tabs[0].url) } });
    });
    */
    selectItemAvailability();
    chrome.tabs.onUpdated.addListener((id, info, tab) => {
        if (tab.url.includes("https://www.facebook.com/marketplace/") && info.url && (info.url.includes("/search/") || info.url.includes("/category/"))) {
            selectItemAvailability();
            if (info.status === "loading") {
                console.log("reloading");
                reset();
                checkBatch(true);
            } else if (info.status === "complete") {
                pause();
            }
        }
    });

    ["sort", "hideDistance", "hideDistanceVal", "hideTimeOver", "hidetimeOverVal", "hidePriceUnder", "hidePriceUnderVal", "hidePriceOver", "hidePriceOverVal", "showNegotiable", "explicitWords", "explicitWordsVal", "explicitWordsHide", "explicitWordsHideVal"].forEach(filter => {
        document.querySelector("#" + filter).addEventListener("change", () => {
            console.log('document.querySelector("#" +' + filter + ')');
            checkBatch(true);
        });
    });

    document.querySelector("#start").addEventListener("click", function (e) {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            sendMessage({ type: "start", data: getParams(tabs[0].url) });
            e.target.classList.add("active");
            document.querySelector("#pause").classList.remove("active");
        });
    });
    document.querySelector("#pause").addEventListener("click", pause);

    document.querySelector("#items-available").addEventListener("click", function (e) {
        chrome.storage.local.set({ "bfbm-params": { ...storage["bfbm-params"], "availability": "available" } }).then(() => {
            e.target.classList.add("active");
            document.querySelector("#items-sold").classList.remove("active");
            reset();
            checkBatch();
        });
    });
    document.querySelector("#items-sold").addEventListener("click", function (e) {
        chrome.storage.local.set({ "bfbm-params": { ...storage["bfbm-params"], "availability": "sold" } }).then(() => {
            e.target.classList.add("active");
            document.querySelector("#items-available").classList.remove("active");
            reset();
            checkBatch();
        });
    });

    document.querySelector("#items-hidden").addEventListener("click", () => {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            chrome.tabs.update(tabs[0].id, { url: tabs[0].url + (tabs[0].url.includes("?") ? "&" : "?") + "bfbmHidden=true" }).then(() => {

            });
        });
    });

});

function sendMessage(message) {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        chrome.tabs.sendMessage(tabs[0].id, message, function (response) { });
    });
}

function sortBy(sort) {
    switch (sort) {
        case "time":
            return (a, b) => {
                let x = parseInt(a.creation_time), y = parseInt(b.creation_time);
                return x > y ? -1 : x < y ? 1 : 0;
            }
        case "price":
            return (a, b) => {
                let x = parseInt(a.listing_price.amount), y = parseInt(b.listing_price.amount);
                return x < y ? -1 : x > y ? 1 : 0;
            }
        case "distance":
            return (a, b) => {
                let xlat = parseFloat(a.location.latitude), xlong = parseFloat(a.location.longitude), ylat = parseFloat(b.location.latitude), ylong = parseFloat(b.location.longitude);
                let pythx = Math.sqrt(Math.pow(lat - xlat, 2) + Math.pow(long - xlong, 2));
                let pythy = Math.sqrt(Math.pow(lat - ylat, 2) + Math.pow(long - ylong, 2));
                return pythx < pythy ? -1 : pythx > pythy ? 1 : 0;
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