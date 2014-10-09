
// templatize this for the env
module.exports =
{
    db: {
        url : "mongodb://localhost/sis",
        opts : {
                "server": {
                    "auto_reconnect": true,"socketOptions": {"keepAlive": 1}, "poolSize": 5
                },
                db: {"native_parser": true, w: 1, j: true}
            }
    },
    server : {
        port : 3000
    },
    app : {
        auth : true,
        auth_config : {
            type : 'sis'
        }
    }
};
