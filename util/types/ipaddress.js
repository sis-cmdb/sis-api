// IPAddress type
module.exports = exports = function IpAddr(mongoose) {
    'use strict';

    var Schema = mongoose.Schema;
    var SchemaType = mongoose.SchemaType;
    var Types = mongoose.Types;
    var mongo = mongoose.mongo;
    var Address6 = require("ip-address").Address6;
    var Address4 = require("ip-address").Address4;

      /**
       * Long constructor
       *
       * @inherits SchemaType
       * @param {String} key
       * @param {Object} [options]
       */

    function IpAddress(key, options) {
        SchemaType.call(this, key, options);
    }

    /*!
     * inherits
     */

    require('util').inherits(IpAddress, SchemaType);

    /**
     * Implement checkRequired method.
     *
     * @param {any} val
     * @return {Boolean}
     */

    IpAddress.prototype.checkRequired = function (val) {
        return null !== val;
    };

    /**
     * Implement casting.
     *
     * @param {any} val
     * @param {Object} [scope]
     * @param {Boolean} [init]
     * @return {mongo.Long|null}
     */
    var MAX_V6 = new Address6("ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff").bigInteger();
    var MAX_V4 = new Address4("255.255.255.255").bigInteger();

    var FIELDS = [
        'ip_address',
        'version',
        'cidr',
        'network',
        'broadcast',
        'subnet_mask'
    ];

    var toObject = function(addr, version) {
        var end = addr.endAddress();
        var start = addr.startAddress();
        var endBi = end.bigInteger();
        var startBi = start.bigInteger();

        var net = startBi.xor(endBi);
        var netAddr = null;
        if (version == 'v6') {
            netAddr = Address6.fromBigInteger(net.xor(MAX_V6));
        } else {
            netAddr = Address4.fromBigInteger(net.xor(MAX_V4));
        }

        var result = {
            'ip_address' : addr.addressMinusSuffix,
            'version' : version,
            'cidr' : addr.subnetMask,
            'network' : start.addressMinusSuffix,
            'broadcast' : end.addressMinusSuffix,
            'subnet_mask' : netAddr.addressMinusSuffix
        };
        return result;
    };

    IpAddress.prototype.cast = function (val, scope, init) {
        if (null === val) return val;
        if ('' === val) return null;

        if (typeof val == 'string') {
            // ugly..
            var addr = null;
            var version = null;
            if (val.indexOf(':') != -1) {
                addr = new Address6(val);
                version = 'v6';
            } else {
                addr = new Address4(val);
                version = 'v4';
            }
            if (!addr.isValid()) {
                throw new SchemaType.CastError('IpAddress', addr.error);
            }
            return toObject(addr, version);
        } else if (typeof val == 'object') {
            var valid = true;
            for (var i = 0; i < FIELDS.length; ++i) {
                if (!(FIELDS[i] in val)) {
                    valid = false;
                    break;
                }
            }
            if (valid) {
                return val;
            }
        }

        throw new SchemaType.CastError('IpAddress', val);
    };

      /*!
       * ignore
       */

    function handleSingle(val) {
        /*jshint validthis:true */
        return this.cast(val);
    }

    function handleArray (val) {
        /*jshint validthis:true */
        var self = this;
        return val.map( function (m) {
          return self.cast(m);
        });
    }

    IpAddress.prototype.$conditionalHandlers = {
      '$lt' : handleSingle,
      '$lte': handleSingle,
      '$gt' : handleSingle,
      '$gte': handleSingle,
      '$ne' : handleSingle,
      '$in' : handleArray,
      '$nin': handleArray,
      '$mod': handleArray,
      '$all': handleArray
    };

      /**
       * Implement query casting, for mongoose 3.0
       *
       * @param {String} $conditional
       * @param {*} [value]
       */

    IpAddress.prototype.castForQuery = function ($conditional, value) {
        var handler;
        if (2 === arguments.length) {
          handler = this.$conditionalHandlers[$conditional];
          if (!handler) {
              throw new Error("Can't use " + $conditional + " with IpAddress.");
          }
          return handler.call(this, value);
        } else {
          return this.cast($conditional);
        }
    };

    Schema.Types.IpAddress = IpAddress;
    return IpAddress;
};
