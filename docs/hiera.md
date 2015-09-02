Table of Contents
=================

- [Hiera API](#hiera-api)
    - [Hiera Objects](#hiera-objects)
    - [Retrieving Hiera data](#retrieving-hiera-data)
    - [Adding a new hiera entry](#adding-a-new-hiera-entry)
    - [Updating a hiera entry](#updating-a-hiera-entry)
    - [Deleting a hiera entry](#deleting-a-hiera-entry)


# Hiera API

This API is based off the Hiera http-backend.  More information about the Hiera backend can be found [here](https://github.com/crayfishx/hiera-http).

## Hiera Objects

A Hiera object in SIS has the following schema definition:

```javascript
{
    // The name of the hiera entry.  This could be a fqdn, environment, etc.
    // Required and unique string.
    "name" : { "type" : "String", "required" : true, "unique" : true },

    "_sis" : {
        // The owner groups of the schema
        // See [Role Based Access Control](./docs/rbac.md)
        "owner" : { "type" : ["String"] }
    },

    // The actual key value pairs associated with the entry
    "hieradata" : { "type" : "Mixed", "required" : true }
}
```

An example Hiera object is below:

```javascript
{
    "name" : "sample.env",
    "_sis" : { "owner" : ["SISG1"] },
    "hieradata" : {
        "port" : 1000,
        "num_instances" : 1,
        "db_host" : "db.sample.env"
    }
}
```

The `hieradata` object can be anything provided the values are JSON friendly.

## Retrieving Hiera data

* `GET /api/v1.1/hiera` - returns a list of hiera entries
* `GET /api/v1.1/hiera/:name` - returns a hash with a single key value pair as a hash where the key is the supplied `:name` parameter and the value is hieradata value of the object.  For instance, using the above example, the result of `GET /api/v1.1/hiera/sample.env` would be:

```javascript
{
    "sample.env" : {
        "port" : 1000,
        "num_instances" : 1,
        "db_host" : "db.sample.env"
    }
}
```


## Adding a new hiera entry

* `POST /api/v1.1/hiera`

The request body must be a valid hiera object as defined above.  This method will error if an entry with the same name exists.

The response is the full hiera object.

Error cases:

* An entry with the same name already exists.
* Authorization failure

## Updating a hiera entry

* `PUT /api/v1.1/hiera/:name`

The request body must be a valid entry object.  The `name` in the object must match the `name` in the path parameter.
Partial updates are supported.

The response is the updated hiera entry object.

Error cases:

* The name in the payload does not match the name in the path.
* The entry does not exist
* Authorization failure
* `_sis.immutable` is true

## Deleting a hiera entry

* `DELETE /api/v1.1/hiera/:name`

Deletes the heira entry with the specified `name` or errors.

The response contains the deleted entry.

Error cases:

* The entry does not exist
* Authorization failure
* `_sis.locked` is true
