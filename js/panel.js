let batchTimer;
let batch = {};
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

function checkBatch() {
    chrome.tabs.query({ url: ["https://www.facebook.com/marketplace/*"] }, function (tabs) {
        const path = tabs[0].url;
        chrome.storage.local.get([path], storage => {
            //selectItemAvailability();
            const availability = tabs[0].url.includes("availability=out%20of%20stock") ? "sold" : "available";
            const keys = Object.keys(batch);
            keys.forEach(key => {
                batch[key].availability = availability;
            });

            let existing = storage[path] ? storage[path] : {};
            let updatedData = { ...existing, ...batch };
            if (keys.length === 0) return;

            batch = {};
            chrome.storage.local.set({ [path]: updatedData }).then(() => {
                document.querySelector(".batch-count").textContent = "dumped";

                filterItems();
            });

        });
    });
}

async function detectNewItem(request) {
    request.getContent((body) => {
        if (request.request && request.request.url && request.request.url.includes('https://www.facebook.com/api/graphql/')) {
            try {
                let req = body.split('{"data":')[1].split(',"extensions":{')[0];
                let data = JSON.parse(req);
                if (data?.viewer?.marketplace_product_details_page?.target) {
                    let x = data.viewer.marketplace_product_details_page.target;
                    x.availability = "available";
                    x.hide = false;
                    x.negotiable = x.can_buyer_make_checkout_offer ? true : isItemNegotiable(x.marketplace_listing_title + " " + x.redacted_description.text);
                    if (!batch[x.id]) {
                        batch[x.id] = { ...x, "updated": true };
                    } else {
                        batch[x.id] = { ...batch[x.id], ...x };
                    }
                    document.querySelector(".batch-count").textContent = Object.keys(batch).length + " waiting";
                }
            } catch (e) {
                let x = document.createElement("p");
                x.textContent = e;
                document.body.appendChild(x);
            }
        }
    });
}

function createListing(item) {
    let div = document.createElement("div");
    div.classList.add("item-container");
    div.dataset.id = item.id;

    div.innerHTML = `<div class="item-info">
                        <div style="display: flex;justify-content:space-between">
                            <div>
                                <div class="item-price">
                                    ${item.listing_price.formatted_amount_zeros_stripped} ${item.negotiable ? " or offer" : ""}
                                </div>
                                ${item.is_shipping_offered ? `<div>${item.formatted_shipping_price}</div>` : ""}
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
                    <img class="item-image image-active image-primary" data-imgnum="0" src="${item.listing_photos[0].image.uri}"></img>`;

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


function getCurrentItemHeight() {

    document.querySelector(".items").innerHTML += '<div id="height-check"><div class="item-container"></div><div class="item-container"></div><div class="item-container"></div><div class="item-container"></div></div>';
    let check = document.getElementById("height-check");
    let first = check.querySelectorAll(".item-container")[0];
    const height = first.getBoundingClientRect().height;
    check.remove()

    return height
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

function filterItems() {
    chrome.tabs.query({ url: ["https://www.facebook.com/marketplace/*"] }, function (tabs) {
        const save = document.querySelector("#save-under").value;
        chrome.storage.local.get("saved", data => {
            let pathnames = getSavedPathnames(save, data);
            chrome.storage.local.get([...pathnames, "settings"], storage => {

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
                    let xlat = parseFloat(item.location.latitude), xlong = parseFloat(item.location.longitude);
                    let pythx = Math.sqrt(Math.pow(options.lat - xlat, 2) + Math.pow(options.long - xlong, 2));
                    let prc = parseInt(item.listing_price.amount);
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
                    let section = (parseInt(item.listing_price.amount) === 0 || parseInt(item.listing_price.amount) === low) && incr === 0 ? 0 : parseInt((parseInt(item.listing_price.amount) - low) / incr);
                    if (section >= num_graph_sections) section = num_graph_sections;
                    sections[section]++;
                    if (sections[section] > sections[max_section]) {
                        max_section = section;
                    }
                    currentItems.push(createListing(item));
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
            });
        })
    });
}

const wh = window.innerHeight;
const gridGap = 10;
var numCols = 0;
var ih = getCurrentItemHeight() + gridGap;
let prev = 0;

function display() {
    document.querySelector(".items-scroll").style.height = ((currentItems.length / numCols) * ih) + "px";

    let begin = document.createDocumentFragment();

    const numItems = Math.ceil(wh / ih) * numCols;

    for (var i = 0; i < numItems + numCols; i++) {

        if (i >= currentItems.length) continue;

        let container = document.createElement("div");
        container.classList.add("item");
        container.appendChild(currentItems[i]);

        begin.appendChild(container);
    }


    document.querySelector(".items").innerHTML = "";
    document.querySelector(".items").appendChild(begin);

    let items = document.querySelectorAll(".item");

    const virtualScroll = () => {
        var scrollTop = document.body.scrollTop;
        var maxScroll = ((currentItems.length / numCols) * ih) - wh;

        let x = Math.floor(scrollTop / ih);
        let y = (x * ih);


        const start = Math.min(Math.floor((scrollTop / ih)) * numCols);
        if (start === prev || scrollTop >= maxScroll) return;

        document.querySelector(".items").style.top =  y + "px";

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


function pause() {
    sendMessage({ type: "pause" });
    document.querySelector("#pause").classList.add("active");
    document.querySelector("#start").classList.remove("active");
}

function reset() {
    document.querySelector(".items").textContent = "";
}

function updateResize() {
    ih = getCurrentItemHeight();
    numCols = Math.round(document.querySelector(".items").clientWidth / ih);
}

window.onresize = updateResize;

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

const loadSettings = (callback = () => { }) => {
    chrome.tabs.query({ url: ["https://www.facebook.com/marketplace/*"] }, function (tabs) {
        chrome.storage.local.get(["settings", "saved"], storage => {
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
        });
    });
}

document.addEventListener("DOMContentLoaded", function () {

    loadSettings(() => { updateResize(); filterItems() });

    //checkBatch()
    batchTimer = setInterval(checkBatch, 5000);
    chrome.devtools.network.onRequestFinished.addListener(detectNewItem);

    selectItemAvailability();

    // new search is performed
    chrome.tabs.onUpdated.addListener((id, info, tab) => {
        if (tab.url.includes("https://www.facebook.com/marketplace/") && info.url && (info.url.includes("/search/") || info.url.includes("/category/"))) {
            selectItemAvailability();
            if (info.status === "loading") {
                batch = {};
                reset();
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
            detectNewItem(request);
        }
    });

    //document.addEventListener("scroll", load);

    // refilter after changing filters
    ["sort", "hideEmojis", "beforeYear", "beforeYearVal", "direction", "hideDistance", "hideDistanceVal", "hideTimeOver", "hidetimeOverVal", "hidePriceUnder", "hidePriceUnderVal", "hidePriceOver", "hidePriceOverVal", "showNegotiable", "explicitWords", "explicitWordsVal", "explicitWordsHide", "explicitWordsHideVal"].forEach(filter => {
        document.querySelector("#" + filter).addEventListener("change", () => {
            console.log('document.querySelector("#" +' + filter + ')');
            filterItems();
            //checkBatch(true);
            //display();
        });
    });

    //send start message to content script
    // document.querySelector("#start").addEventListener("click", function (e) {
    //     //clearInterval(refreshInterval);
    //     //refresh();
    //     //refreshInterval = setInterval(refresh, 10000);

    //     chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    //         const save = document.querySelector("#save-under").value;
    //         chrome.storage.local.get("saved", storage => {
    //             for (let i = 0; i < storage["saved"].length; i++) {
    //                 if (storage["saved"][i].name === save) {
    //                     if (!storage["saved"][i].pathnames.includes(tabs[0].url)) {
    //                         storage["saved"][i].pathnames.push(tabs[0].url);
    //                         chrome.storage.local.set({ "saved": storage["saved"] });
    //                     }
    //                     break;
    //                 }
    //             }
    //             sendMessage({ "type": "start", "name": save });
    //             e.target.classList.add("active");
    //             document.querySelector("#pause").classList.remove("active");
    //         });
    //     });

    // });    
     document.querySelector("#start").addEventListener("click", function (e) {
         chrome.tabs.query({ currentWindow: true, lastFocusedWindow: true }, function (tabs) {
             if (!tabs || tabs.length === 0) {
                console.error("No active tab found");

                 return;
             }
            
             const activeTab = tabs[0];
             if (!activeTab.url) {
                 console.error("The active tab has no URL");
                 return;
             }
    
             const save = document.querySelector("#save-under").value;
             chrome.storage.local.get("saved", storage => {
                 if (!storage.saved || !Array.isArray(storage.saved)) {
                     console.error("No saved storage found or it's not an array");
                     return;
                 }
    
                 for (let i = 0; i < storage.saved.length; i++) {
                     if (storage.saved[i].name === save) {
                         if (!storage.saved[i].pathnames.includes(activeTab.url)) {
                             storage.saved[i].pathnames.push(activeTab.url);
                             chrome.storage.local.set({ "saved": storage.saved });
                         }
                         break;
                     }
                 }
                 sendMessage({ "type": "start", "name": save });
                 e.target.classList.add("active");
                 document.querySelector("#pause").classList.remove("active");
             });
         });
     });

    
    






    // send pause message to content script
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

    document.querySelector("#create-save").addEventListener("click", function (e) {
        const save = document.querySelector("#create-save-name").value;
        if (save === "") return;
        chrome.storage.local.get("saved", storage => {
            //chrome.tabs.query({ url: ["https://www.facebook.com/marketplace/*/search*", "https://www.facebook.com/marketplace/category/*"] }, function (tabs) {
            let existing = storage["saved"] ? storage["saved"] : [];
            existing.push({ "name": save, "pathnames": [] });
            chrome.storage.local.set({ "saved": existing }).then(() => {
                loadSettings(() => {
                    document.querySelector("#save-under").value = save;
                    document.querySelector("#save-under").querySelector("option[value=" + save + "]").selected = true;
                    filterItems();
                });
            });
            //})
        });
    });

    document.querySelector("#save-under").addEventListener("change", function (e) {
        filterItems();
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {

    });

});

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
            console.log(response);
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
                let xlat = parseFloat(a.location.latitude), xlong = parseFloat(a.location.longitude), ylat = parseFloat(b.location.latitude), ylong = parseFloat(b.location.longitude);
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
