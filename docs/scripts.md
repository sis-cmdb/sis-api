Table of Contents
=================

- [Scripts API](#script-api)
    - [Script Objects](#script-objects)
    - [Retrieving scripts](#retrieving-scripts)
    - [Creating a new script](#creating-a-new-script)
    - [Updating a script](#updating-a-script)
    - [Deleting a script](#deleting-a-script)
- [Writing Scripts](#writing-scripts)
    - [Globals](#globals)
      - [req](#req)
      - [res](#res)
      - [client](#client)
    - [Libraries](#libraries)
    - [Sample](#sample)
- [Invoking Endpoints](#invoking-endpoints)

# Scripts API

Scripts are pieces of custom code users can write to define their own [custom endpoints](#invoking-endpoints).  Scripts are able to query SIS data and manipulate results for customized output.

## Script Objects

A script can be represented by the following schema definition:

```javascript
{
    // The script name.  Required and unique across all scripts.  This name is
    // used as part of the endpoint when invoking the script.
    name : { type : "String", required : true,
             unique : true, match :  /^[a-z0-9_\-]+$/ },

    // A description of the script and what invoking it does
    description : { type : "String" },

    // The type of script.  Only javascript is supported at the moment
    script_type : { type: "String", required : true, enum : ["application/javascript"] },

    // The script content.
    script : { type: "String", code: true, required: true, code_type_field: "script_type" },

    // sis meta fields omitted (owner, tags, etc.)
}
```

For example, a script that responds with "hello world" looks like:

```javascript
{
    "name" : "hello_world_script",
    "_sis" : { "owner" : ["SCRIPT_TEST"] },
    "description" : "Hello world!!",
    "script_type" : "application/javascript",
    "script" : "res.send('Hello World');"
}
```

## Retrieving scripts

* `GET /api/v1.1/scripts` - returns a list of script objects
* `GET /api/v1.1/scripts/:name` - returns a script with the specified name

## Creating a new script

* `POST /api/v1.1/scripts`

The request body must be a valid script object.  This method will error if a script with the same name exists.

The response is the created script.

Error cases:

* An entry with the same name already exists.
* Validation failure
* Authorization failure

## Updating a script

* `PUT /api/v1.1/scripts/:name`

The request body must be a valid script object.  The name in the script object must match the name in the path parameter.  This implies that script names cannot be changed.

The response is the updated script object.

Error cases:

* Any errors from create
* The name in the payload does not match the name in the path.
* The script does not exist
* `sis_immutable` is true

## Deleting a script

* `DELETE /api/v1.1/scripts/:name`

Removes the script with the specified name.

The response is the deleted script.

Error cases:

* `_sis.locked` is true
* The script does not exist
* Authorization failure

# Writing Scripts

Currently only JavaScript scripts are supported.  This section covers the APIs available for script writers in JS.

## Globals

Scripts have access to a few globals to deal with the HTTP request/response and interacting with SIS data.  The common JavaScript globals like the `JSON` object are also exposed.

### req

The `req` object available to the script represents the HTTP request.  It is a simple object with the following properties:
  - req.path - the path of the request sent to the script
  - req.endpoint - the endpoint name being called
  - req.method - HTTP method
  - req.body - JSON body if applicable
  - req.headers - the headers sent to the endpoint
  - req.query - the query parameters sent up as a dictionary

### res

The `res` object available to the script represents the HTTP response.  The script must use the `res` object to send response data back to the HTTP client.

  - res.set(headerName,headerValue) - set a header.  returns res for chaining
  - res.status(code) - set the status code.  returns res for chaining
  - res.send(data) - send the data - this should be the last action a script takes.  Data should be a string.
  - res.json(obj) - send the object as JSON back.  An alias for `res.set("Content-Type","application/json").send(JSON.stringify(obj));`

As an example, `res.set("Content-Type","text/plain").status(200).send("Hello World")` will send a 200 OK back to the client with Hello World as plain text.

### client

The `client` object represents a SIS client with an API similar to the one provided by [sis-js](https://github.com/sis-cmdb/sis-js).  The client API does differ in a few ways:

 - There are no callbacks in the exposed endpoint methods.  All methods return Promises.
 - Only getters are exposed on the endpoint (`get` and `listAll`).
 - Only entities can be queried.

## Libraries

In addition to the global variables exposed, scripts have access to the following libraries:

 - [bluebird](https://github.com/petkaantonov/bluebird) - exposed as `BPromise`.
 - [csv](https://github.com/wdavidw/node-csv) - exposed as `csv`.

## Sample

The following is an example script that can be used within SIS.

```javascript

// handle the /echo path
function echo() {
   // just sends the request back as json
   res.json(req);
}

// handle querying SIS - called w/ /sis path
// This example queries a fictional "host" schema and assumes the schema
// has a name and environment field.

function querySis() {
   // get a promise for a single entity of type "host" with id "localhost"
   var hostPromise = client.entities("host").get("localhost");

   // get 10 hosts where the environment is "qa"
   var query = { "environment" : "qa" };
   var qaHostsPromise = client.entities("host").listAll({ q : query, limit : 10 });

   // use bluebird to "join" the promises
   BPromise.all([hostPromise, qaHostsPromise]).spread(function(host, qaHosts) {
       // convert to CSV
       var hosts = [host].concat(qaHosts);
       var csvRows = hosts.map(function(host) {
           return [ host.name, host.environment ];
       });
       // return as csv
       csv.stringify(csvRows, function(err, output) {
           // handle error
           if (err) { return res.status(500).send(err); }
           // send it back
           res.set("Content-Type","text/csv").send(output);
       });
   });
}

// process the request
if (req.path === "/echo") {
    echo();
} else if (req.path === "/sis") {
    querySis();
} else {
    // everything else
    res.send("Hello World!");
}

```

# Invoking Endpoints

After creating a Script object within SIS, clients can invoke them by using `/api/v1.1/endpoints/:script_name`.  For example, if a script was created with name "foo", clients can issue requests against: `/api/v1.1/endpoints/foo`.

If the script content was the same as the sample above, then the following requests would work:

 - `/api/v1.1/endpoints/foo/echo` - responds with the request object in JSON format
 - `/api/v1.1/endpoints/foo/sis` - responds with the result of `querySis()`

All other requests against `/api/v1.1/endpoints/foo` would result in "Hello World".
