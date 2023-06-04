chrome.runtime.onInstalled.addListener(() => {
    console.log("updated");
    //chrome.storage.local.clear();
    chrome.storage.local.set({"settings": {"lat": 12.345678, "long": 12.345678, "delay": 1000, "max_items": 0}, "saved": [{"name": "all", "pathnames": []}]});
});