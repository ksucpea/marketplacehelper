chrome.runtime.onInstalled.addListener(() => {
    console.log("updated");
    //chrome.storage.local.clear();
    chrome.storage.local.set({"settings": {"lat": 39.311888, "long": -76.875436, "delay": 1000, "max_items": 0}/*, "saved": [{"name": "all", "pathnames": []}]*/});
});

console.log("LHELLO!!!!");