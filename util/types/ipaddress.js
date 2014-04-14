/***********************************************************

 The information in this document is proprietary
 to VeriSign and the VeriSign Product Development.
 It may not be used, reproduced or disclosed without
 the written approval of the General Manager of
 VeriSign Product Development.

 PRIVILEGED AND CONFIDENTIAL
 VERISIGN PROPRIETARY INFORMATION
 REGISTRY SENSITIVE INFORMATION

 Copyright (c) 2013 VeriSign, Inc.  All rights reserved.

 ***********************************************************/

module.exports = exports = function IpAddr(mongoose) {
    'use strict';

    var Schema = mongoose.Schema;
    var SchemaType = mongoose.SchemaType;
    var Types = mongoose.Types;
    var mongo = mongoose.mongo;
    var v6 = require("ipv6").v6;
    var v4 = require("ipv6").v4;

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
    var MAX_V6 = new v6.Address("ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff").bigInteger();
    var MAX_V4 = new v4.Address("255.255.255.255").bigInteger();

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
            netAddr = v6.Address.fromBigInteger(net.xor(MAX_V6));
        } else {
            netAddr = v4.Address.fromBigInteger(net.xor(MAX_V4));
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
                addr = new v6.Address(val);
                version = 'v6';
            } else {
                addr = new v4.Address(val);
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

        console.log("Cast: " + JSON.stringify(val));

        // if (val instanceof Number || 'number' == typeof val)
        //   return mongo.IpAddress.fromNumber(val);

        // if (!Array.isArray(val) && val.toString)
        //   return mongo.IpAddress.fromString(val.toString());

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
