  // templatize this for the env
mongo_host = 'localhost';
mongo_port = 27017;
if (process.env.MONGO_HOST) {
  mongo_host = process.env.MONGO_HOST;
}
if (process.env.MONGO_PORT) {
  mongo_port = process.env.MONGO_PORT;
}

module.exports =
{
    db: {
        url : 'mongodb://'+mongo_host+':'+mongo_port+'/sis',
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
