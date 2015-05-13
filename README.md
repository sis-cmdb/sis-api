Table of Contents
=================

- [Description](#description)
- [Building and Testing](#building-and-testing)
- [Configuration](#configuration)
    - [Authentication Backends](#authentication-backends)
        -[Default Backend](#default-backend-configuration)
        -[Active Directory over LDAP](#active-directory-over-ldap)
- [Tools](#tools)
    - [Creating Users](#creating-users)
    - [Deleting Users](#deleting-users)
- [LICENSE](#license)
- [REST API Documentation](#rest-api-documentation)

[![Build Status](https://travis-ci.org/sis-cmdb/sis-api.svg?branch=develop)](https://travis-ci.org/sis-cmdb/sis-api)

# Description

The Service Information System (SIS) is a CMDB alternative designed with
collaboration and customizability in mind.  Access to all data is strictly via
the familiar principles of REST over HTTP.

The SIS API allows you to interact with SIS data using anything that can issue an HTTP
request and parse JSON.  The API allows clients to do a variety of operations including:

- CRUD object definitions.  SIS refers to these as `schemas` and map to concepts
like DB Tables or object classes.
- CRUD instances of objects of a `schema`.  These are referred to as `entities` in SIS.
- Register for notifications when any SIS object is created, modified, or deleted.
In SIS terms, these are called `hooks`.
- Retrieve the state of a SIS object at a particular moment in time.
- Control access to objects and ensure the right users can manage them.
- Access the API from any website using a browser that supports [CORS](http://en.wikipedia.org/wiki/Cross-origin_resource_sharing).

More details can be found in the [API Documentation](./docs/index.md)

# Requirements

The following are required to build and run SIS:

- [node](nodejs.org) 0.12.x or iojs 1.8.x+
- [mongodb](https://www.mongodb.org/) 2.6+.

# Building and Testing

[Grunt](http://gruntjs.com/) is used to build SIS.  [Mocha](http://visionmedia.github.io/mocha/) is used for testing.

1. Ensure a local mongodb instance is running on port 27017.
    - `mongod --dbpath=/data --port 27017` will launch a mongo server listening on 27017 and writing data to `/data`
2. Ensure grunt is installed via: `npm install -g grunt-cli`
3. From the root directory, run `npm install`.
4. Run `grunt` to build a distribution and run unit tests.
5. The main file is `server.js`.  Simply run `node server.js` to start the server.

# Configuration

The configuration is represented in conf/config.json and overrides can be supplied via conf/config.json.  An annotated config.json looks like:

```javascript
{
    // database specific configuration
    "db": {
        // a mongo db connection string
        "url" : "mongodb://localhost/sis"
    },
    // server specific config
    "server" : {
        // the tcp port to listen on
        "port" : 3000
    },
    // application specific settings
    "app" : {
        // whether Role Based Access Control is enabled.  Defaults to true
        "auth" : true
        // authentication backend config.  See below
        // defaults to a sis backend.
        "auth_config" : {
            // specific info per backend
        },
        // whether the app only serves read requests (GET).  Defaults to false
        "readonly" : false,
        // whether to enable custom scripts support
        "scripts_enabled" : false,
        // minimum workers to run scripts in pool
        "scripts_min" : 1,
        // maximum workers to run scripts in pool
        "scripts_max" : 2,
        // time that a worker can remain idle before being collected
        "script_worker_idle_time_ms" : 300000,
        // use the cluster module
        "use_cluster" : true,
        // optional read preference to use on GET requests
        "get_read_pref" : "nearest"
    },
    // default logger options - see bunyan configuration
    "logger" : {
        "options" : {
            "name" : "SIS",
            "level" : "debug",
            "streams" : [{
                "path" : "./sis.log"
            }]
        }
    },
}
```

## Authentication Backends

### Default Backend

The default backend authenticates a user against a password stored with the user object.  Password hashes are stored in SIS if this backend is used.  Configure using:

```javascript
"auth_config" : {
    "type" : "sis"
}
```

### Active Directory over LDAP

The LDAP authentication backend authenticates users belonging to a particular user domain via Active Directory.  When a user successfully authenticates for the first time, the backend creates an empty User object with no privileges.

Configure the backend using:

```javascript
"auth_config" : {
    "type" : "ldap",
    "url" : "<url of the LDAP endpoint>",
    "user_domain" : "<the user domain to authenticate against>",
    "email_domain" : "<the domain to append as the email address for the user>",
    "client_opts" " {
        "option_1" : "option_1_value",
        // etc.  These are options used when creating the [ldapjs client](http://ldapjs.org/client.html)
    }
}

```

As an example, with the following config:

```javascript
"auth_config" : {
    "type" : "ldap",
    "url" : "ldap://10.1.1.1",
    "user_domain" : "ad.corp.com",
    "email_domain" : "company.com"
}
```

An authentication request for `user1` will attempt to authenticate `user1@ad.corp.com` and create the user `user1` with email `user1@company.com` if successful and does not already exist.

# Tools

This section documents some tools provided in the source.

## Creating Users

After SIS is up and running, creating an initial super user is the next logical step.  The initial user must be created via command line as there are no users who are permitted to use the REST API.  To create a super user, create a json file that looks like the following:

```javascript
{
    "name" : "a_super_user",
    "pw" : "super_user_pw",
    "email" : "super@user.com",
    "super_user" : true
}
```

Then run `node tools/useradmin.js update /path/to/json/file`

## Deleting Users

Similar to creating a user, create a JSON file with the following contents

```javascript
{
    "name" : "user_to_delete"
}
```

Then run `node tools/useradmin.js delete /path/to/json/file`

# LICENSE

This software is licensed under the BSD 3-Clause license.  Please refer to the [LICENSE](./LICENSE) for more information.

# REST API Documentation

Detailed documentation can be found in the [docs](./docs/index.md) folder.
