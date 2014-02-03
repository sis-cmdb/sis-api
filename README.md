sis-web
=======

# Configuration

Configuration for sis can be found in config.js.  A sample config file contains the following:

```javascript
module.exports = {
    // database specific configuration
    db: {
        // a mongo db connection string
        url : "mongodb://localhost/sis"
    },
    // server specific config
    server : {
        // the tcp port to listen on
        port : 3000
    },
    // application specific settings
    app : {
        // whether Role Based Access Control is enabled.  Defaults to true
        auth : true
        // whether the app only serves read requests (GET).  Defaults to false
        readonly : false
    }
}
```

# API Description

Every API method described below returns data with `Content-Type: application/json`.

All POST and PUT requests must have the `content-type: application/json` header set.

## Role based access control

Throughout this document, users will see many objects with an `owner` field.  Please consult the
documentation on [Role Based Access Control](./docs/rbac.md) for more information.

If RBAC is enabled, all PUT/POST/DELETE requests must also include the `x-auth-token` header per the documentation.

## Schema API

Manage schemas of all entities in the system.  A sample schema object looks like:

```javascript
{
    // The name of the schema
    "name" : "sample",
    // an owner field, for future use / organization.
    // (i.e. an array of "ResOps", "ProvOps", etc.)
    "owner" : ["SIS"],
    // A definition of what entities will look like
    // leveraging mongoose syntax
    "definition" : {
        "requiredField" : { "type" : "String", "required" : true },
        "uniqueNumberField" : { "type" : "Number", "unique" : true },
        "stringField":    "String",
        "numberField" : "Number",
        "nestedDocument" : {
            "nestedString" : "String",
            "nestedBoolean" : "Boolean"
        },
        "anythingField" : { "type" : "Mixed" }
    }
}
```

SIS reserves all schema names that begin with "sis_".  Adding a schema that starts with "sis_" results in an error.

Fields in a definition cannot start with an _ and are considered reserved by SIS:

Current fields used by SIS and added to entities:

* _id - persistent ID of the object
* __v - version of the object, primarily used by mongoose
* _created_at - a UTC timestamp of when the object was created
* _updated_at - a UTC timestamp of when the object was last updated

Please consult the [mongoosejs schematypes doc](http://mongoosejs.com/docs/schematypes.html) for more information on what the definition object may look like.  Note that Date objects are currently not supported.

### Retrieving schemas

* `GET /api/v1/schemas`
* `GET /api/v1/schemas/:name`

If no name is specified in the path, returns a list of schema objects.

The name must contain only lowercase ascii characters, digits, or underscores.

### Creating a new schema

* `POST /api/v1/schemas`

The request body must be a valid schema object.  This method will error if a schema with the same name exists.

The response is the schema object along with two additional fields assigned by mongoose:

* `_id` - the database assigned ID of the schema.  Not used in this API
* `__v` - the version number of the schema.

### Updating a schema

* `PUT /api/v1/schemas/:name`

The request body must be a valid schema object.  The name in the schema object must match the name in the path parameter.  This implies that schema names cannot be changed.

The response is the updated schema object.  If a field is removed, it is removed from all entities adhering to that schema.

### Deleting a schema

* `DELETE /api/v1/schemas/:name`

Removes the schema with the specified name along with all entities adhering to it.

## Entity API

Manage the entities that adhere to a particular schema.  For example, an entity that adheres to the "sample" schema above would be:

```javascript
{
    "stringField":    "sampleString",
    "numberField" : 20,
    "uniqueNumberField" : 1,
    "requiredField" : "required string",
    "anythingField" : {
        "anything" : "goes",
        "in" : ["this", "field"]
     }
}
```

### Special fields

* owner - The SIS [Role Based Access Control](./docs/rbac.md) allows an entity to have its own set of groups that can act on it.
An optional `owner` field is added to every entity definition and is treated as a string array where each entry is a group.  If
specifying owners, the entries must be a subset of the owners in the schema, otherwise an error is returned.

See the SIS RBAC document for more information.

### Retrieving Entities of a particular schema

* `GET /api/v1/entities/:schema_name`
* `GET /api/v1/entities/:schema_name/:id`

Path parameters:
- `schema_name` the `name` of the schema
- `id` the `_id` field of the stored entity via PUT/POST methods.

For example, to retrieve entities belonging to the example schema, a client would issue a GET request against `/api/v1/entities/sample`

### Creating a new entity

* `POST /api/v1/entities/:schema_name`

The request body must be a valid entity object that adheres to the schema definition of of the schema with name `schema_name`.  This method will error if the schema does not exist or the object is malformed.

The response is the entity object along with two additional fields assigned by mongoose:

* `_id` - the database assigned ID of the entity.
* `__v` - the version number of the entity.

### Updating an entity

* `PUT /api/v1/entities/:schema_name/:id`

The request body must be a valid entity object that adheres to the schema definition of of the schema with name `schema_name`.  The `_id` in the entity object must match the id in the path parameter.

The response is the updated entity object.

### Deleting an entity

* `DELETE /api/v1/entities/:schema_name/:id`

Removes the entity belonging to the schema with name `schema_name` that has the `_id` specified by the `id` path parameter.


## Hooks API

Hooks allow users to receive notifications when objects are inserted, updated, and deleted from the SIS database.

For example, a hook that listens for all events on the 'sample' entities above would look like:

```javascript
{
    "name" : "hook_name",
    "owner" : ["hook_owner"],
    "entity_type" : "sample",
    "retry_count" : 5, // max number of times to retry sending the hook
    "retry_delay" : 10, // delay in seconds between retries
    "target" : {
        "action" : "POST",
        "url" : "http://sample.service.com/endpoint"
    },
    "events": ["update", "insert", "delete"]
}
```

The `retry_count` and `retry_delay` fields are optional, and default to 0 and 1, respectively.  All other fields are required.

The `name` must contain only lowercase ascii characters, digits, or underscores.  It must be unique across all hooks.

The `entity_type` field specifies which entity type the hook should be dispatched for.  This is typically the same value as the `name` field in a schema object.

Hooks can also be registered for schemas and hiera data by specifying `sis_schemas` and `sis_hiera` as the entity_type, respectively.

The `target` field specifies the endpoint that the payload is sent to and which HTTP method to use.  POST, GET, and PUT are the only valid actions.

The `events` field specifies which event triggers the hook dispatch.

The payload is sent via HTTP to `target.url`.  Assuming the entity above was inserted, the following payload would be posted to `target.url`:

```javascript
{
    "hook" : "hook_name",
    "entity_type" : "sample",
    "event" : "insert",
    "data" : {
        "stringField":    "sampleString",
        "numberField" : 20,
        "anythingField" : {
            "anything" : "goes",
            "in" : ["this", "field"]
         },
         "_id" : "database_generated_id",
         "__v" : 0
    }
}
```

In the case of PUT and POST, the payload is sent in the request body.  When a GET request is issued, all fields are sent as a query parameter (i.e. hook=hook_name&entity_type=sample&event=insert).  The `data` parameter is the JSON encoded representation of the entity.

### Retrieving hooks

* `GET /api/v1/hooks`
* `GET /api/v1/hooks/:name`

If no name is specified in the path, returns a list of hook objects.  Otherwise a single hook is returned or 404.

The name must contain only lowercase ascii characters, digits, or underscores.

### Creating a new hook

* `POST /api/v1/hooks`

The request body must be a valid hook object.  This method will error if a hook with the same name exists.

The response is the hook object along with two additional fields assigned by mongoose:

* `_id` - the database assigned ID of the schema.  Not used in this API
* `__v` - the version number of the schema.

### Updating a hook

* `PUT /api/v1/hooks/:name`

The request body must be a valid hook object.  The name in the hook object must match the name in the path parameter.  This implies that hook names cannot be changed.

The response is the updated hook object.

### Deleting a hook

* `DELETE /api/v1/hooks/:name`

Removes the hook with the specified name.

## Hiera API

This API is based off the Hiera http-backend.  More information about the Hiera backend can be found [here](https://github.com/crayfishx/hiera-http).

A Hiera object in SIS looks like:

```javascript
{
    "name" : "fqdn, env, etc.",
    "owner" : ["data_owner"],
    "hieradata" : {
        "key1" : "data1",
        "key2" : "data2",
        // etc.
    }
}
```

### Retrieving Hiera data

* `GET /api/v1/hiera`
* `GET /api/v1/hiera/:name`

There is a subtle difference in the data returned.  The list method includes the full object, meaning it will return a JSON object with a `name` and `hieradata` fields.  However, the single retrieval method will return the `hieradata` JSON object of the entry with name `name`.

This is to match what hiera-http expects and is modeled based on the information in this [blog post](http://www.craigdunn.org/2012/11/puppet-data-from-couchdb-using-hiera-http/).

### Adding a new hiera entry

* `POST /api/v1/hiera`

The request body must be a valid hiera object as defined above.  This method will error if an entry with the same name exists.

The response is the hiera object along with two additional fields assigned by mongoose:

* `_id` - the database assigned ID of the entry.  Not used in this API.  Get is done via the name
* `__v` - the version number of the entry.

### Updating a hiera entry

* `PUT /api/v1/hiera/:name`

The request body must be a valid entry object.  The `name` in the object must match the `name` in the path parameter.

The response is the updated hiera entry object.

### Deleting a hiera entry

* `DELETE /api/v1/hiera/:name`

Deletes the heira entry with the specified `name` or errors.

## Pagination and searching

All GET requests that retrieve a list of entities support pagination and search.

### Pagination

The following query parameters are used in pagination:

* limit - the number of items to fetch.  200 by default.  At most 200 items can be retrieved
* offset - the number of items to skip before fetching.  0 based.

### Search

Search / filtering is done by passing a URL encoded JSON object in the q parameter.  The object looks like a mongo query object.

For instance:

`/api/v1/schemas?q={"owner":"SIS"}` returns a list of schemas where the owner is "SIS"

## Revisions and Commit Log support

SIS tracks changes on all objects (schemas, entities, hooks, and hiera) and provides an API for viewing all commits on an object and what the state of an object looked like at a moment in time.

A commit object looks like the following:

```javascript
{
    "type" : "String", // The type of object
    "entity_id" : "String", // The id of the object (depends on the type)
    "action" : {"type" : "String", "required" : true, enum : ["update", "insert", "delete"]},
    "diff" : "Mixed", // the diff object from [JsonDiffPatch](https://github.com/benjamine/JsonDiffPatch) if action is update, the new object if insert, null if delete
    "old_value" : "Mixed", // old value if update, null if insert, old value if delete
    "date_modified" : { "type" : "Number" }, // same as the _updated_at value of the entity that was saved
    "modified_by" : "String" // username of the user who modified it
}
```

The `type` field is either a schema name (added via the schemas API) or one of the following:

* sis_schemas - an actual schema object
* sis_hiera - a hiera object
* sis_hooks - a hook object

The `entity_id` field is the value of the `_id` field in entities, and the `name` field in all SIS objects.

All commits also have an _id field used for retrieval purposes.

### Retrieving the commits of an object

All individual objects in SIS have a getter by id.  For instance, a hook is retrieved via: `/api/v1/hooks/:hook_name`.  To get the commits on an object, simply append `/commits` to the path.

The commits API follows the same pagination rules and filtering abilities of all list retrieval APIs.

As an example, to retrieve a list of commits on a hook with name "my_hook", issue a GET request against `/api/v1/hooks/my_hook/commits`.

To retrieve a list of commits on an entity of type 'my_type' with `_id` 1234, issue a GET request against `/api/v1/entities/my_type/1234/commits`.

### Retrieving an individual commit of an object

To retrieve an individual commit, append the `_id` of the commit object to the commits URL.  The returned object is a commit object with an additional field - `value_at`.  The `value_at` field is the actual state of the object with `old_value` having the `diff` applied to it.

### Retrieving an object at a particular time

To retrieve an object's state at a particular time, append `/revisions/:utc_timestamp` to the getter path of that object.  This returns the object at that time.  Note that the timestamp is in millis.

For example, to retrieve the `my_hook` object at 11/11/11 @ 11:11:11 (utc timestamp 1321009871000), issue the request `/api/v1/hooks/my_hook/revisions/1321009871000`

Timestamps in the future will return the current object.  Timestamps in the past return 404.

### Example commit log

The following is a commit log for a hiera entry that was added, updated, and deleted by user1.

```javascript
[
// initial add of object
{
    "_updated_at": 1385599521201,
    "type": "sis_hiera",
    "entity_id": "hiera_entry",
    "action": "insert",
    "modified_by": "user1",
    "diff": {
        "__v": 0,
        "_updated_at": 1385599521199,
        "name": "hiera_entry",
        "hieradata": {
            "field_n": 0,
            "field": "v1"
        },
        "_id": "529692213a74002bdf000003",
        "_created_at": 1385599521199,
        "owner": ["group1"]
    },
    "old_value": null,
    "date_modified": 1385599521199,
    "_id": "529692213a74002bdf000004",
    "__v": 0,
    "_created_at": 1385599521200
},
// update
{
    "_updated_at": 1385599522221,
    "type": "sis_hiera",
    "entity_id": "hiera_entry",
    "action": "update",
    "modified_by": "user1",
    "diff": {
        "_updated_at": [1385599521199, 1385599522218],
        "hieradata": {
            "new_field": ["new"],
            "field": ["v1", 0, 0],
            "field_n": [0, 0, 0]
        }
    },
    "old_value": {
        "_updated_at": 1385599521199,
        "name": "hiera_entry",
        "hieradata": {
            "field": "v1",
            "field_n": 0
        },
        "_id": "529692213a74002bdf000003",
        "__v": 0,
        "_created_at": 1385599521199,
        "owner": ["group1"]
    },
    "date_modified": 1385599522218,
    "_id": "529692223a74002bdf000005",
    "__v": 0,
    "_created_at": 1385599522220
},
// deletion
{
    "_updated_at": 1385599523236,
    "type": "sis_hiera",
    "entity_id": "hiera_entry",
    "action": "delete",
    "modified_by": "user1",
    "diff": null,
    "old_value": {
        "_updated_at": 1385599522218,
        "name": "hiera_entry",
        "hieradata": {
            "field": "v1",
            "field_n": 0
        },
        "_id": "529692213a74002bdf000003",
        "__v": 0,
        "_created_at": 1385599521199,
        "owner": ["group1"]
    },
    "date_modified": 1385599523236,
    "_id": "529692233a74002bdf000006",
    "__v": 0,
    "_created_at": 1385599523236
}]
```

## Data Sharing and Organization

There are many ways to manage data in SIS and organize it for collaboration and isolation.  Please see [Organizing Data in SIS](./docs/sharing.md).

# Examples using resty

The following example utilizes [resty](https://github.com/micha/resty), a convenient wrapper around curl.  All sample files are in the [samples](./samples) directory.

```bash
# initialize resty
. resty
resty http://sis.endpoint.com/api/v1 -H "Content-Type: application/json" -H "Accept: application/json"

# assuming we're in the samples directory...

# create a hook that listens for schema inserts - modify this to point to your server if you actually want to receive them.

POST /hooks < hook_schema.json

# create a hook that listens for inserts on the sample entity

POST /hooks < hook_sample.json

# retrieve all the hooks

GET /hooks

# create the sample schema

POST /schemas < schema_sample.json

# create a sample entity

POST /entities/sample < entity_sample.json

# creating it again will fail the unique number test

POST /entities/sample < entity_sample.json

# Create more stuff if you want and then retrieve them.

GET /entities/sample

# Delete the sample schema

DELETE /schemas/sample

# Note that the sample type is now unknown

GET /entities/sample

# Add some hiera data

POST /hiera < hiera_common.json

# note the full object returned.. but get the hiera data for common
# returns just the data portion

GET /hiera/common

# Cleanup

DELETE /hooks/schema_hook_name
DELETE /hooks/sample_hook_name
DELETE /hiera/common

```


# Developer Info

## Frameworks
- express web framework
- mocha testing
- jade templating

## Project Layout
- server.js - main server
- routes/ - routes go here.  server.js will bootstrap them.  different files for different API bases (devices, vips, etc.)
- test/ - mocha tests
- public/ - static files
- views/ - jade templates

## Running tests

Mocha must be installed in the global path

`npm install -g mocha`

From the sis-web dir run `mocha --timeout 4000`

Tests require a mongo instance to be running.  See test/test-config.js.  Additionally, the connection url may be specified as the `db__url` environment variable.

### Tests TODO

- field selection
- token management HTTP API
