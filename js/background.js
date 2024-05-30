chrome.runtime.onInstalled.addListener(() => {
    console.log("updated");
    //chrome.storage.local.clear();
    chrome.storage.local.get(["settings", "saved"], storage => {
        let newOptions = {};
        if(!storage["settings"]) {
            newOptions["settings"] = { "lat": 12.345678, "long": 12.345678, "delay": 1000, "max_items": 1000 };
        }
        if (!storage["saved"]) {
            newOptions["saved"] =  [{"name": "all", "pathnames": []}];
        }
        chrome.storage.local.set(newOptions);
    })
});