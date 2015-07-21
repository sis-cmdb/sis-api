"use strict";

let data = [
    {"name":"hello", "value":"world" },
    {"name":"foo", "value":"bar" }
];

let csvData = [
    ['hello','world'],
    ['foo','bar']
];

function renderCsv() {
    res.csv(csvData);
}

function renderYml() {
    res.yaml(data);
}

function renderJson() {
    res.json(data);
}

if (req.path === "/yaml") {
    renderYml();
} else if (req.path === "/csv") {
    renderCsv();
} else {
    renderJson();
}
