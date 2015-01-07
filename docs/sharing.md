Table of Contents
=================

- [Referencing common objects](#referencing-common-objects)
- [Using owner subsets](#using-owner-subsets-on-the-same-schema)
- [Duplicating Schema definitions](#duplicating-schema-definitions)

Organizing Data in SIS
======================

There are a few ways to organize data in SIS and each has its own set of
idioms.  This document only deals with schemas and entities under those
schemas, and is primarily geared towards those looking for ways to
share data across multiple groups.

For information on user permissions and groups, see the SIS
[Role Based Access Control](./rbac.md) documentation.

# Referencing common objects

This approach is a way to extend common objects via referencing.

Consider the following schemas and entities:

```javascript
// schemas w/ definitions

// /api/v1.1/schemas/common_objects
{
    name : "common_objects"
    owner : ["common"],
    definition : {
        // attributes of a "common_object"
        field_1 : "String",
        field_2 : "Number"
    }
}

// /api/v1.1/schemas/extended_objects
{
    name : "extended_objects",
    owner : ["extended"],
    definition : {
        // reference to common_object
        common : { type : "ObjectId", ref : "common_objects" },
        // additional fields
        ext_field_1 : "String",
        ext_field_2 : "Number",
        // fields can even be named the same.  No impact on what
        // is stored on common_object reference
        field_1 : "Number"
    }
}

// entities

// common_object with id "common_1"
// /api/v1.1/entities/common_objects/common_1
{
    _id : "common_1",
    field_1 : "some common string",
    field_2 : 80
}

// an extended_object that references common_1
// /api/v1.1/entities/extended_objects/extended_1
{
    _id : "extended_1",
    // common object expanded - populated on GET requests
    common : {
        _id : "common_1",
        field_1 : "some common string",
        field_2 : 80
    },
    ext_field_1 : "some additional string",
    ext_field_2 : 20,
    field_1 : 300
}

// another extended object that references common_1
// /api/v1.1/entities/extended_objects/extended_2
{
    _id : "extended_2",
    // common object expanded - populated on GET requests
    common : {
        _id : "common_1",
        field_1 : "some common string",
        field_2 : 80
    },
    ext_field_1 : "some other additional string",
    ext_field_2 : 40,
    field_1 : 500
}

```

* Only users of the group "common" can create/modify instances of the "common_objects".
* Only users of the group "extended" can create/modify instances of the "extended_objects".
* Updating entity "extended_1" has no effect on "common_1".
* Updating entity "extended_1 has no effect on "extended_2".
* Updates to the entity "common_1" are reflected when "extended_1" is retrieved.
* Referencing is legal since references never modify the object.
* Schema changes to "common_objects" do not affect any "extended_objects" and vice versa.

# Using owner subsets on the same schema

This is a way to allow multiple groups to operate on entities belonging to the same schema.
Consider the following:

```javascript
// shared_objects schema
// /api/v1.1/schemas/shared_objects
{
    name : "shared_objects"
    owner : ["group1", "group2"],
    definition : {
        // attributes of a "shared_object"
        field_1 : "String",
        field_2 : "Number"
    }
}

// entities
// shared_object with id "shared_1" that can only be edited by
// users of group "group1"
// /api/v1.1/entities/shared_objects/shared_1
{
    _id : "shared_1",
    owner : ["group1"],
    field_1 : "some string 1",
    field_2 : 111
}

// shared_object with id "shared_2" that can only be edited by
// users of group "group2"
// /api/v1.1/entities/shared_objects/shared_2
{
    _id : "shared_2",
    owner : ["group2"],
    field_1 : "some string 2",
    field_2 : 222
}
```

* Only users with the "group2" role can modify "shared_2".
* Only users with the "group1" role can modify "shared_1".
* Only a user with admin rights for "group1" and "group2" can create/modify the "shared_objects" schema.
* The entities must be created with the `owner` field specified, otherwise they inherit the owner from the schema.
* Schema changes to "shared_objects" will affect all shared_object instances.


# Duplicating Schema definitions

This approach essentially silos data by using different schemas that have the same definition with a different name.
Consider the following:

```javascript
// schemas
// /api/v1.1/schemas/schema_1
{
    name : "schema_1",
    owner : ["schema1_owners"],
    definition : {
        name : "String",
        field_1 : "String",
        field_2 : "Number"
    }
}

// /api/v1.1/schemas/schema_2
{
    name : "schema_2",
    owner : ["schema2_owners"],
    definition : {
        name : "String",
        field_1 : "String",
        field_2 : "Number"
    }
}
```

* Entities created under "schema_1" and "schema_2" are independent.
* Schema modifications to "schema_1" have no impact on "schema_2" or entities under "schema_2".
* Entities for "schema_1" can only be created/modified by users with permissions on "schema1_owners".
* Entities for "schema_2" can only be created/modified by users with permissions on "schema2_owners".
