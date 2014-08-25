
// exported config object
module.exports = {
    db: {
        url : "mongodb://localhost/sis-test",
        opts : {
                "server": {
                    "auto_reconnect": true,"socketOptions": {"keepAlive": 1}, "poolSize": 5
                },
                db: { w: 1, j: true }
            }
    },
    server : {
        port : 3001,
        address : "127.0.0.1"
    },
    app : {
        auth : true
    }
};
