Table of Contents
=================

- [Schema API](#schema-api)
    - [Schema Definitions](#schema-definitions)
        - [Reserved fields](#reserved-fields)
    - [Schema Objects](#schema-objects)
    - [Retrieving schemas](#retrieving-schemas)
    - [Creating a new schema](#creating-a-new-schema)
    - [Updating a schema](#updating-a-schema)
    - [Deleting a schema](#deleting-a-schema)

# Schema API

The Schema API is used to manage the schemas of all user defined entities in the system.  The base endpoint is `/api/v1.1/schemas`.

## Schema Definitions

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

### Reserved fields

Definition fields cannot start with `_` or `sis_`.  Additionally, `owner` is a
reserved field and should not be present in the definition object.

## Schema Objects

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

    // Whether the schema can be updated
    "sis_immutable" : { "type" : "Boolean", "required" : true, "default" : false },

    // The owner groups of the schema
    "owner" : { "type" : ["String"], "required" : true },

    // The schema definition.  Must be a valid definition object
    "definition" : { "type" : "Mixed", "required" : true },

    // An optional description of the schema
    "description" : "String",

    // An array of field names that cannot be deleted from the definition
    "locked_fields" : { "type" : ["String"] },

    // A field indicating whether to track changes for objects in this schema
    // and is true by default
    "track_history" : { "type" : "Boolean", "default" : true },

    // Indicates that the schema can be modified by anybody, regardless of ownership status
    // Also allows any user with a role to create entities of this type
    "is_open" : { "type" : "Boolean", "default" : false },

    // Specifies the field used when retrieving, updating, or deleting an entity by id
    // the id_field must be unique and required in the definition object
    "id_field" : { "type" : "String", "default" : "_id" },

    // Indicates that the schema can only be modified by the owners, but that
    // any user with a role can create entities of this type
    "is_public" : { "type" : "Boolean", "default" : false },

    // Allows any user who is an admin of at least one group in the owner groups
    // to modify it.  By default, a schema can only be modified by a user who is
    // an admin of all owner groups.
    "any_owner_can_modify" : { "type" : "Boolean", "default" : false },
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

## Retrieving schemas

* `GET /api/v1.1/schemas` - returns a list of schema objects
* `GET /api/v1.1/schemas/<name>` - returns a schema object where the `name` field is `<name>`.

An optional `with_counts=true` query parameter can be specified.  In the GET requests.  If specified,
the returned object will include a field called `entity_counts` which is a number indicating how many
entities are in the schema.

## Creating a new schema

* `POST /api/v1.1/schemas`

The request body must be a valid schema object.

The response is the created schema object.

Error cases:

* A schema with the same name exists.
* The schema name starts with "sis_".
* A field in the definition starts with "_" or "sis_".  Note nested document fields can start with anything.
* An owner field is specified in the definition that is not of type ["String"].
* Authorization failure

## Updating a schema

* `PUT /api/v1.1/schemas/<name>`

The request body must be a valid schema object.  Partial updates are not supported.  Schema names cannot be changed.

The response is the updated schema object.  If a field is removed, it is removed from all entities adhering to that schema.

Error cases:

* Any errors from create
* The schema does not exist
* `sis_immutable` is true

## Deleting a schema

* `DELETE /api/v1.1/schemas/<name>`

Removes the schema with the specified name along with all entities adhering to it.

The response is the deleted object.

Error cases:

* `sis_locked` is true
* The schema does not exist
* Authorization failure
