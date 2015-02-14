"use strict";
var BPromise = require("bluebird");

function Response(d) {
    var headers = {};
    var sent = false;
    var status = 200;
    this.set = function(name, value) {
        headers[name] = value;
        return this;
    };
    this.status = function(statusCode) {
        status = statusCode;
        return this;
    };
    this.send = function(data) {
        if (sent) {
            // throw out
            throw new Error("Double send.");
        } else {
            sent = true;
            d.resolve({
                status : status,
                data : data,
                headers : headers
            });
        }
    };
    this.json = function(data) {
        this.set("Content-Type","application/json")
            .send(JSON.stringify(data));
    };
}

module.exports = Response;
