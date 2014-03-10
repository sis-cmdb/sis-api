Table of Contents
=================

- [sis-web](#sis-web)
- [Configuration](#configuration)
- [API Description](#api-description)
	- [Role based access control](#role-based-access-control)
	- [Authentication Backends](#authentication-backends)
		- [Default backend configuration](#default-backend-configuration)
		- [Authentication using Active Directory via LDAP](#authentication-using-active-directory-via-ldap)
	- [Common Headers](#common-headers)
	- [Schema API](#schema-api)
		- [Schema Definitions](#schema-definitions)
			- [Reserved fields](#reserved-fields)
		- [Schema Objects](#schema-objects)
		- [Retrieving schemas](#retrieving-schemas)
		- [Creating a new schema](#creating-a-new-schema)
		- [Updating a schema](#updating-a-schema)
		- [Deleting a schema](#deleting-a-schema)
	- [Entity API](#entity-api)
		- [Entity objects](#entity-objects)
		- [Entity Owner Field](#entity-owner-field)
		- [Retrieving Entities of a particular schema](#retrieving-entities-of-a-particular-schema)
		- [Creating a new entity](#creating-a-new-entity)
		- [Updating an entity](#updating-an-entity)
		- [Deleting an entity](#deleting-an-entity)
	- [Hooks API](#hooks-api)
		- [Hook Objects](#hook-objects)
		- [Hook payloads](#hook-payloads)
		- [Retrieving hooks](#retrieving-hooks)
		- [Creating a new hook](#creating-a-new-hook)
		- [Updating a hook](#updating-a-hook)
		- [Deleting a hook](#deleting-a-hook)
	- [Hiera API](#hiera-api)
		- [Hiera Objects](#hiera-objects)
		- [Retrieving Hiera data](#retrieving-hiera-data)
		- [Adding a new hiera entry](#adding-a-new-hiera-entry)
		- [Updating a hiera entry](#updating-a-hiera-entry)
		- [Deleting a hiera entry](#deleting-a-hiera-entry)
	- [Pagination and searching](#pagination-and-searching)
		- [Pagination](#pagination)
		- [Search](#search)
			- [Joins](#joins)
	- [Revisions and Commit Log support](#revisions-and-commit-log-support)
		- [Commit Objects](#commit-objects)
		- [Retrieving the commits of an object](#retrieving-the-commits-of-an-object)
		- [Retrieving an individual commit of an object](#retrieving-an-individual-commit-of-an-object)
		- [Retrieving an object at a particular time](#retrieving-an-object-at-a-particular-time)
		- [Example commit log](#example-commit-log)
	- [Data Sharing and Organization](#data-sharing-and-organization)
- [API Examples using resty](#api-examples-using-resty)
- [Developer Info](#developer-info)
	- [Frameworks](#frameworks)
	- [Project Layout](#project-layout)
	- [Running tests](#running-tests)
		- [Tests TODO](#tests-todo)

sis-web
=======

SIS API web implementation.

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
        // authentication backend config.  See below
        // defaults to a sis backend.
        auth_config : {
            // specific info per backend
        },
        // whether the app only serves read requests (GET).  Defaults to false
        readonly : false
    }
}
```

# API Description

The only way to interface with SIS is via the HTTP API described below.  All objects are transmitted in JSON format.

## Role based access control

Throughout this document, users will see many objects with an `owner` field.  Please consult the
documentation on [Role Based Access Control](./docs/rbac.md) for more information.

## Authentication Backends

### Default backend configuration

The default backend authenticates a user against a password stored with the user object.  Password hashes are stored in SIS if this backend is used.  Configure using:

```javascript
auth_config : {
    "type" : "sis"
}
```

### Authentication using Active Directory via LDAP

The LDAP authentication backend authenticates users belonging to a particular user domain via Active Directory.  When a user successfully authenticates for the first time, the backend creates an empty User object with no privileges.

Configure the backend using:

```javascript
auth_config : {
    "type" : "ldap",
    "url" : "<url of the LDAP endpoint>",
    "user_domain" : "<the user domain to authenticate against>",
    "email_domain" : "<the domain to append as the email address for the user>"
}
```

As an example, with the following config:

```javascript
auth_config : {
    "type" : "ldap",
    "url" : "ldap://10.1.1.1",
    "user_domain" : "ad.corp.com",
    "email_domain" : "company.com"
}
```

An authentication request for `user1` will attempt to authenticate `user1@ad.corp.com` and create the user `user1` with email `user1@company.com` if successful and does not already exist.

## Common Headers

Endpoints always return responses always contain a `Content-Type: application/json` header.

POST and PUT requests must have the `Content-Type: application/json` header.

Endpoints requiring [authentication](./docs/rbac.md) must also include the `x-auth-token` header.

## Schema API

Manage schemas of all entities in the system.

### Schema Definitions

The SIS schema definition object maps directly to the schema definitions defined by [mongoosejs](http://mongoosejs.com).  Consult the [schematypes doc](http://mongoosejs.com/docs/schematypes.html) for more information on what the definition object may look like.  Note that Date objects are currently not supported.  Below is a quick reference:

```javascript
var definition = {
  // String field
  "name":    "String",
  // Boolean field (true / false)
  "living":  "Boolean",
  // Number field with optional min and max qualifiers
  "age":     { "type" : "Number", "min": 18, "max": 65 },
  // A mixed field - anything can go in this field.  Useful for times
  // when fields are unknown
  "mixed":   "Mixed",
  // An object ID
  "someId":  "ObjectId",
  // An array of mixed types
  "array":      [],
  // An array where the type is specified
  "ofString":   ["String"],
  "ofNumber":   ["Number"],
  "ofBoolean":  ["Boolean"],
  "ofMixed":    ["Mixed"],
  "ofObjectId": ["ObjectId"],
  // A nested document
  "nested": {
    "stuff": { "type": "String", "lowercase": true, "trim": true }
  },
  // A reference to another entity in SIS
  "reference" : {"type" : "ObjectId", "ref" : "other_schema_name" },
  // A String enum
  "enumField" : {"type" : "String", "enum" : ["ONE", "OF", "THESE", "VALUES", "ONLY"]}
}
```

Note that Date and Buffer types are *not currently supported* in SIS.

#### Reserved fields

Fields in a definition cannot start with _ and are considered reserved by SIS.

Current definition fields used by SIS and added to entities:

* _id - persistent ID of the object - ObjectId
* __v - version of the object, primarily used by mongoose - Number
* _created_at - a UTC timestamp of when the object was created - Number
* _created_by - username of entity creator - String
* _updated_at - a UTC timestamp of when the object was last updated - Number
* _updated_by - username of last user who updated the entity - String

Additionally, SIS provides the following fields on all objects that authorized users may modify:

* sis_locked - indicates whether the object can be deleted - Boolean
* owner - a list of groups that can modify or remove the object.
  * schemas require admins of the groups specified
  * all other objects require users of the groups specified
  * See [Role Based Access Control](./docs/rbac.md) for more information

### Schema Objects

A schema object can be represented by the following schema definition:

```javascript
{
    // The name of the schema.  Required and Unique across all schemas.
    // Must be all lowercase alphanumeric and underscores
    "name" : {
        "type" : "String",
        "required" : true,
        "unique" : true,
        "match" : "/^[a-z0-9_]+$/"
    },

    // Whether the schema is locked - defaults to false
    "sis_locked" : { "type" : "Boolean", "required" : true, "default" : false },

    // The owner groups of the schema
    // See [Role Based Access Control](./docs/rbac.md)
    "owner" : { "type" : ["String"], "required" : true },

    // The schema definition.  Must be a valid definition object
    "definition" : { "type" : "Mixed", "required" : true },

    // An array of field names that cannot be deleted from the definition
    "locked_fields" : { "type" : ["String"] },

    // A field indicating whether to track changes for objects in this schema
    // and is true by default
    "track_history" : { "type" : "Boolean", "default" : true }
}
```

The following is an example schema object for a schema named `sample`:

```javascript
{
    "name" : "sample",
    "owner" : ["SISG1", "SISG2"],
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
    },
    "locked_fields" : ["numberField", "stringField"],
    "track_history" : true
}
```

SIS reserves all schema names that begin with "sis_".

### Retrieving schemas

* `GET /api/v1/schemas` - returns a list of schema objects
* `GET /api/v1/schemas/:name` - returns a schema object with the particular name.

### Creating a new schema

* `POST /api/v1/schemas`

The request body must be a valid schema object.  This method will error if a schema with the same name exists.  Adding a schema that starts with "sis_" results in an error.

### Updating a schema

* `PUT /api/v1/schemas/:name`

The request body must be a valid schema object.  The name in the schema object must match the name in the path parameter.  This implies that schema names cannot be changed.

The response is the updated schema object.  If a field is removed, it is removed from all entities adhering to that schema.

### Deleting a schema

* `DELETE /api/v1/schemas/:name`

Removes the schema with the specified name along with all entities adhering to it.  This method fails if `sis_locked` is set to true on the schema object.

## Entity API

Manage the entities that adhere to a particular schema.

### Entity objects

The data contained in the entity is based on the `definition` field of the schema that it belongs to.  For example, an entity for the "sample" schema defined above may look like this:

```javascript
{
    "stringField":    "sampleString",
    "numberField" : 20,
    "uniqueNumberField" : 1,
    "requiredField" : "required string",
    "anythingField" : {
        "anything" : "goes",
        "in" : ["this", "field"]
     },
    "owner" : ["SISG1"]
}
```

### Entity Owner Field

The `owner` field of an entity must be a subset of the `owner` field of the schema it belongs to.  If not specified, the intersection of the users's role groups and the schema owners is used.  See the SIS [Role Based Access Control](./docs/rbac.md) document for more information.

### Retrieving Entities of a particular schema

* `GET /api/v1/entities/:schema_name` - returns a list of entities belonging to `schema_name`.
* `GET /api/v1/entities/:schema_name/:id` - returns an entity with the specified id belonging to `schema_name`.

Path parameters:
- `schema_name` the `name` of the schema
- `id` the `_id` field of the entity.

For example, to retrieve a list of entities belonging to a schema with name `sample`, a client would issue a GET request against `/api/v1/entities/sample`.

### Creating a new entity

* `POST /api/v1/entities/:schema_name`

The request body must be a valid entity object that adheres to the schema definition of of the schema with name `schema_name`.  This method will error if the schema does not exist or the object is malformed.

### Updating an entity

* `PUT /api/v1/entities/:schema_name/:id`

The request body must be a valid entity object that adheres to the schema definition of of the schema with name `schema_name`.  The `_id` in the entity object must match the id in the path parameter.

The response is the updated entity object.

### Deleting an entity

* `DELETE /api/v1/entities/:schema_name/:id`

Removes the entity belonging to the schema with name `schema_name` that has the `_id` specified by the `id` path parameter.  This method fails if `sis_locked` is set to true.

## Hooks API

Hooks allow users to receive notifications when objects are inserted, updated, and deleted from the SIS database.

### Hook Objects

A hook can be represented by the following schema definition:

```javascript
{
    // The name of the schema.  Required and Unique across all schemas.
    // Must be all lowercase alphanumeric and underscores
    "name" : { "type" : "String", "required" : true, "unique" : true, "match" : "/^[a-z0-9_]+$/" },
    // Defines the target URL that SIS calls out to
    // It is an object with three fields
    // - url - required string that is the URL to call out to
    // - action - HTTP method to use.  One of "GET", "POST", "PUT".
    "target" : {
            "type" : {
                "url" : { "type" : "String", "required" : true },
                "action" : { "type" : "String", "required" : true, "enum" : ["GET", "POST", "PUT"]}
            },
            "required" : true
    },
    // The number of times to retry calling this hook before giving up.  Defaults to 0.
    // Max number of times is 20.
    "retry_count" : { "type" : "Number", "min" : 0, "max" : 20, "default" : 0 },

    // The number of seconds between retries.  The longest delay is 60 seconds.
    // Defaults to 1 second
    "retry_delay" : { "type" : "Number", "min" : 1, "max" : 60, "default" : 1 },

    // The events that trigger this hook.  Any combination of "insert", "update", or "delete".  Determines
    // if the hook should be fired when an object is created, updated, or deleted.
    "events" : { "type" : [{ "type" : "String", "enum" : ["insert", "update", "delete"] }], "required" : true },

    // The entity type that the hook is interested in.  May be a schema name or one of:
    // - sis_schemas - type for schemas
    // - sis_hiera - type for heira entries in SIS
    "entity_type" : "String",

    // The owners the hook.  Note that this does not need to correlate with the entity type of the hook.
    "owner" : { "type" : ["String"] }
}
```

For example, a hook that listens for all events on the `sample` entities above would look like:

```javascript
{
    "name" : "sample_hook",
    "owner" : ["SISG1"],
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

### Hook payloads

When a hook triggers, it calls out to the service specified in `target.url` with a payload based on the event type.  The payload has the following definition:

```javascript
{
    // name of the hook that was triggered
    "hook" : "String",

    // the entity type that the event occurred on
    "entity_type" : "String",

    // the event that occurred.  One of "update", "insert", or "delete"
    "event" : "String",

    // the entity data.  If the event is insert or delete, it represents
    // the data that was created or being removed, respectively.  If an update,
    // this field represents the object after the update was applied
    "data" : "Mixed",

    // if event is "update", this field represents the old value of the entity
    // this value is not present in insert or delete payloads
    "old_value" : "Mixed"
}
```

The following is an example payload that would be sent to a service via a webhook:

```javascript
{
    "hook" : "hook_name",
    "entity_type" : "sample",
    "event" : "insert",
    "data" : {
        "stringField":    "sampleString",
        "numberField" : 20,
        "uniqueNumberField" : 1,
        "requiredField" : "required string",
        "anythingField" : {
            "anything" : "goes",
            "in" : ["this", "field"]
         },
        "owner" : ["SISG1"]
    }
}
```

In the case of PUT and POST, the payload is sent in the request body.  When a GET request is issued, the payload is sent as a JSON string via the `data` query parameter.

### Retrieving hooks

* `GET /api/v1/hooks` - returns a list of hook objects
* `GET /api/v1/hooks/:name` - returns a hook with the specified name

### Creating a new hook

* `POST /api/v1/hooks`

The request body must be a valid hook object.  This method will error if a hook with the same name exists.

### Updating a hook

* `PUT /api/v1/hooks/:name`

The request body must be a valid hook object.  The name in the hook object must match the name in the path parameter.  This implies that hook names cannot be changed.

The response is the updated hook object.

### Deleting a hook

* `DELETE /api/v1/hooks/:name`

Removes the hook with the specified name.

## Hiera API

This API is based off the Hiera http-backend.  More information about the Hiera backend can be found [here](https://github.com/crayfishx/hiera-http).

### Hiera Objects

A Hiera object in SIS has the following schema definition:

```javascript
{
    // The name of the hiera entry.  This could be a fqdn, environment, etc.
    // Required and unique string.
    "name" : { "type" : "String", "required" : true, "unique" : true },

    // The owner groups of the schema
    // See [Role Based Access Control](./docs/rbac.md)

    // The actual key value pairs associated with the entry
    "hieradata" : { "type" : "Mixed", "required" : true }
}
```

An example Hiera object is below:

```javascript
{
    "name" : "sample.env",
    "owner" : ["SISG1"],
    "hieradata" : {
        "port" : 1000,
        "num_instances" : 1,
        "db_host" : "db.sample.env"
    }
}
```

The `hieradata` object can be anything provided the values are JSON friendly.

### Retrieving Hiera data

* `GET /api/v1/hiera` - returns a list of hiera entries
* `GET /api/v1/hiera/:name` - returns only the `hieradata` portion of the hiera entry with the name specified.

This matches what hiera-http expects and is modeled based on the information in this [blog post](http://www.craigdunn.org/2012/11/puppet-data-from-couchdb-using-hiera-http/).

### Adding a new hiera entry

* `POST /api/v1/hiera`

The request body must be a valid hiera object as defined above.  This method will error if an entry with the same name exists.

### Updating a hiera entry

* `PUT /api/v1/hiera/:name`

The request body must be a valid entry object.  The `name` in the object must match the `name` in the path parameter.

The response is the updated hiera entry object.

### Deleting a hiera entry

* `DELETE /api/v1/hiera/:name`

Deletes the heira entry with the specified `name` or errors.

## Pagination and searching

All GET requests that retrieve a list of objects support pagination and search.

### Pagination

The following query parameters are used in pagination:

* limit - the number of items to fetch.  200 by default.  At most 200 items can be retrieved in a single call.
* offset - the number of items to skip before fetching.  0 based.

### Search

Search / filtering is done by passing a URL encoded JSON object in the q parameter.  The object looks like a [MongoDB query document](http://docs.mongodb.org/manual/tutorial/query-documents/).

For instance:

`/api/v1/schemas?q={"owner":"SIS"}` returns a list of schemas where the owner is "SIS"

#### Joins

Fields in the query objects may also apply to referencing another schema as if they were a nested document.  For instance, consider the following schema definitions (only name and definition provided):

```javascript
{
    "name" : "entity_1",
    "definition" : {
        "some_number" : "Number",
        "some_string" : "String"
    }
}

{
    "name" : "entity_2",
    "definition" : {
        "some_other_number" : "Number",
        "some_other_string" : "String",
        // reference to entity_1 defined above
        "entity_1" : { "type" : "ObjectId", "ref" : "entity_1" }
    }
}
```

Then the following request returns a list of `entity_2` objects that reference an `entity_1` object with a `some_number` field greater than 10:

`GET /api/v1/entities/entity_2?q={"entity_1.some_number" : { "$gt" : 10 }}`

## Revisions and Commit Log support

SIS tracks changes on all objects (schemas, entities, hooks, and hiera) and provides an API for viewing all commits on an object and what the state of an object looked like at a moment in time.

### Commit Objects

A commit object has the following schema definition:

```javascript
{
    // The type of object
    "type" : "String",
    // The id of the object (depends on the type)
    "entity_id" : "String",
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

The `entity_id` field is the value of the `_id` field in entities, and the `name` field in all internal SIS objects.

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

# API Examples using resty

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

From the sis-web dir run `make test`

Tests require a mongo instance to be running.  See test/test-config.js.  Additionally, the connection url may be specified as the `db__url` environment variable.

### Tests TODO

- field selection
- token management HTTP API

## Acknowledgements

[doctoc](https://github.com/thlorenz/doctoc) was used to generate the Table of Contents.

