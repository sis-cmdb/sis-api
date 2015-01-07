Table of Contents
=================

- [Entity API](#entity-api)
    - [Entity objects](#entity-objects)
    - [Entity Owner Field](#entity-owner-field)
    - [Retrieving Entities](#retrieving-entities-of-a-particular-schema)
    - [Creating a new entity](#creating-a-new-entity)
    - [Updating an entity](#updating-an-entity)
    - [Deleting an entity](#deleting-an-entity)
    - [Retrieval Options](#retrieval-options)
        - [Removing empty containers](#removing-empty-containers-from-the-response)
        - [Population](#population)

# Entity API

The Entity API allows clients to manage the entities that adhere to a particular [schema](./schemas.md).
The base endpoint is `/api/v1.1/entities/<schema_name>` where `<schema_name>` is the the name of the schema.

For instance, to manage entities that belong to a schema named `sample`, the base endpoint is at `/api/v1.1/entities/sample`.

## Entity objects

The data contained in the entity is based on the `definition` field of the schema that it belongs to.  For example, given the schema `sample`:

```javascript
// Schema named 'sample'
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

An entity object for the schema looks like:

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

## Entity Owner Field

The `owner` field of an entity must be a subset of the `owner` field of the schema it belongs to.  If not specified, the intersection of the users's role groups and the schema owners is used.  See the SIS [Role Based Access Control](./docs/rbac.md) document for more information.

## Retrieving Entities of a particular schema

* `GET /api/v1.1/entities/<schema_name>` - returns a list of entities belonging to `<schema_name>`.
* `GET /api/v1.1/entities/<schema_name>/<id>` - returns an entity with the specified id belonging to `<schema_name>`.

Path parameters:
- `schema_name` the `name` of the schema
- `id` the `_id` field of the entity.

For example, to retrieve a list of entities belonging to a schema with name `sample`, a client would issue a GET request against `/api/v1.1/entities/sample`.



## Creating a new entity

* `POST /api/v1.1/entities/:schema_name`

The request body must be a valid entity object that adheres to the schema definition of of the schema with name `schema_name`.  This method will error if the schema does not exist or the object is malformed.

The response is the new entity or error.

Error cases:

* A schema with the specified name does not exist.
* The object fails to conform to the schema.
* Unique constraints or validation failures.
* Authorization failure

## Updating an entity

* `PUT /api/v1.1/entities/:schema_name/:id`

The request body must be a valid entity object that adheres to the schema definition of of the schema with name `schema_name`.  The `_id` in the entity object must match the id in the path parameter.
Partial updates are supported.

The response is the updated entity object.

Error cases:

* All errors from the create section
* The object does not exist
* `sis_immutable` is true


## Deleting an entity

* `DELETE /api/v1.1/entities/:schema_name/:id`

Removes the entity belonging to the schema with name `schema_name` that has the `_id` specified by the `id` path parameter.  This method fails if `sis_locked` is set to true.

The response is the deleted entity.

Error cases:

* `sis_locked` is true
* The schema does not exist
* Authorization failure

## Retrieval Options

The Entity API provides some additional query parameters that affect the way objects are returned.

### Removing empty containers from the response

By default, array fields are always included in a response, even if empty.  In some applications, this may not be desirable behavior.

Consider the following object in SIS that is accessible via `GET /api/v1.1/entities/myschema/obj_id`:

```javascript
{
    "_id" : obj_id,
    "name" : "Some name",
    "array_field" : [],
    "nested_doc_1" : {
        "array_field_2" : [],
        "nested_name" : "Foo"
    },
    "nested_doc_2" : {
        "array_field_3" : []
    }
}
```

Issuing `GET /api/v1.1/entities/myschema/obj_id?removeEmpty=true` yields the following result:

```javascript
{
    "_id" : obj_id,
    "name" : "Some name",
    "nested_doc_1" : {
        "nested_name" : "Foo"
    }
}
```

Note that `nested_doc_2` was removed from the response since it would have been empty when `array_field_3` was removed.

### Population

By default, referenced objects are populated 1 level deep.  For instance, consider the following schemas (some fields ommitted for brevity):

```javascript
{
    name : "datacenter",
    definition : {
        name : "String",
        location : "String"
    }
}

{
    name : "rack",
    definition : {
        name : "String",
        datacenter : { type : "ObjectId", ref : "datacenter" }
    }
}

{
    name : "build",
    definition : {
        name : "String",
        os : "String",
        packages : ["String"]
    }
}

{
    name : "machine",
    definition : {
        name : "String",
        rack : { type : "ObjectId", ref : "rack" },
        status : "String",
        build : { type : "ObjectId", ref : "build" },
    }
}


```

Fetching entities of type `machine` will populate the `rack` and `build` objects with the referenced object.
The datacenter field in the populated `rack` object will be an ObjectId.

To disable population, add `populate=false` to the URL.
