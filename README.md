sis-web
=======

# API Description

Every API method described below returns data with `Content-Type: application/json`.

## Schema API

Manage schemas of all entities in the system.  A sample schema object looks like:

```json
{
    // The name of the schema
    "name" : "sample",
    // an owner field, for future use / organization.
    // (i.e. "ResOps", "ProvOps", etc.)
    "owner" : "SIS"
    // A definition of what entities will look like
    // leveraging mongoose syntax 
    "definition" : {
        "stringField":    "String",
        "numberField" : "Number",
        "anythingField" : { },
    }
}
```

Reserved schema names include:

* HieraDataSchema
* SisSchema
* SisHook

Reserved definition fields include:

* _id
* __v

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

```json
{
    "stringField":    "sampleString",
    "numberField" : 20,
    "anythingField" : {
        "anything" : "goes",
        "in" : ["this", "field"]
     }
}
```

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


## Web Hooks API

TODO

| Method | Path                 | Description                       |
|--------|----------------------|-----------------------------------|
| GET    | /api/v1/hooks        | List all of the web hooks         |
| GET    | /api/v1/hooks/:id    | Display the specified web hook    |
| PUT    | /api/v1/hooks/:id    | Update the specified web hook     |
| POST   | /api/v1/hooks        | Create a new web hook             |
| DELETE | /api/v1/hooks/:id    | Delete the specified web hook     |



## Hiera API

This API is based off the Hiera http-backend.  More information about the Hiera backend can be found [here](https://github.com/crayfishx/hiera-http).

A Hiera object in SIS looks like:

```json
{
    "name" : "fqdn, env, etc.",
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

The request body must be a valid entry object.  The `name` in the entity object must match the `name` in the path parameter.

The response is the updated hiera entry object.

### Deleting a hiera entry

* `DELETE /api/v1/hiera/:name`

Deletes the heira entry with the specified `name` or errors.

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

