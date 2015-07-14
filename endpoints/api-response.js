"use strict";
var BPromise = require("bluebird");
var csv = require("csv");
var yaml = require("js-yaml");

function Response(holder) {
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
            throw new Error("Double send");
        }
        sent = true;
        holder.setResponse({
            status  : status,
            data    : data,
            headers : headers
        });
    };
    this.json = function(data) {
        this.set("Content-Type","application/json")
            .send(JSON.stringify(data));
    };
    this.csv = function(data) {
        csv.stringify(data, function(err, output) {
            if (err) {
                this.status(500).json(err);
            } else {
                this.set("Content-Type", "text/csv")
                    .send(output);
            }
        }.bind(this));
    };
    this.yaml = function(data, options) {
        data = data || {};
        var result = yaml.safeDump(data, options);
        this.set("Content-Type", "application/x-yaml")
            .send(result);
    };
}

module.exports = Response;
