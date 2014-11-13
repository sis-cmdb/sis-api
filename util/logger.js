// logger middleware
var bunyan = require('bunyan');
var uuid = require('node-uuid');

function toResponseTime(time) {
    var diff = process.hrtime(time);
    return (diff[0] * 1000) + (diff[1] / 1000000);
}

// heavily borrowed from https://github.com/villadora/express-bunyan-logger/blob/master/index.js
// but trimmed down
module.exports.errorLogger = function(opts) {
    if (process.env.SIS_DISABLE_LOGGING === 'true') {
        return function(err, req, res, next) {
            next(err);
        };
    }
    opts = opts || { };
    opts.name = opts.name || "SIS";
    opts.serializers = opts.serializers || { };
    opts.serializers.req = opts.serializers.req || bunyan.stdSerializers.req;
    opts.serializers.res = opts.serializers.res || bunyan.stdSerializers.res;
    opts.serializers.err = opts.serializers.err || bunyan.stdSerializers.err;

    var logger = bunyan.createLogger(opts);
    return function(err, req, res, next) {
        var startTime = process.hrtime();
        req.id = uuid.v4();
        var childLogger = logger.child({ req_id : req.id });
        req.log = childLogger;

        function log() {
            res.removeListener('finish', log);
            res.removeListener('close', log);

            var logMsg = {
                status : res.statusCode,
                method : req.method,
                url : req.originalUrl,
                httpVersion : [req.httpVersionMajor, req.httpVersionMinor].join("."),
                responseTime : toResponseTime(startTime)
            };

            if (err) {
                logMsg.err = err;
                childLogger.error(logMsg);
            } else {
                childLogger.info(logMsg);
            }
        }

        res.on('finish', log);
        res.on('close', log);

        next(err);
    };
};

module.exports.logger = function(opts) {
    var logger = module.exports.errorLogger(opts);
    return function(req, res, next) {
        logger(null, req, res, next);
    };
};