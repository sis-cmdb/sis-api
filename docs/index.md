Table of Contents
=================

- [API Description](#api-description)
    - [Role based access control](#role-based-access-control)
    - [HTTP Headers](#http-headers)
    - [Errors](#errors)
    - [SIS Resources](#sis-resources)
        - [SIS Fields](#sis-fields)
- [Endpoint API](#endpoint-api)
    - [List retrieval options](#list-retrieval-options)
        - [Pagination](#pagination)
        - [Field selection](#field-selection)
        - [Sorting](#sorting)
        - [Search](#search)
            - [Joins](#joins)
    - [Bulk Operations](#bulk-operations)
        - [Bulk Insert](#bulk-insert)
        - [Bulk Delete](#bulk-delete)
    - [CAS Support](#cas-support)
    - [Upserts](#upserts)
- [Data Sharing and Organization](#data-sharing-and-organization)

# API Description

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

## Role based access control

Read access is provided to any client that can access the REST API endpoint.
This is by design and is meant to encourage collaboration among all users.

All objects in SIS have a set of owners which govern the access users have in SIS.  Please consult the
documentation on [Role Based Access Control](./rbac.md) for more information.

## HTTP Headers

### Response Headers

- `Content-Type` - set on all responses to `application/json`.
- `x-total-count` - only on responses that return pages.  Indicates the total number of items in the list.

### Request Headers

- `Content-Type` - set on all PUT and POST requests.
- Methods that require [authentication](./rbac.md) require one of two headers:
  - `Authorization` - for retrieving an API token via credentials.
  - `x-auth-token` - contains the API token

### Errors

All errors returned by SIS are JSON objects that look like:

```javascript
{
    error: "Error message"
    code: <integer code>
}
```

The code field is currently a placeholder and not very informative.

Additionally, the HTTP status is set appropriately.  The following statuses are used:

* 400 - client issued bad request
* 401 - unauthorized
* 404 - resource not found
* 500 - internal error

## SIS Resources

The SIS API allows clients to manage a number of resources:

- [schemas](./schemas.md) - manage types of entities in SIS
- [entities](./entities.md) - manage objects that belong to a schema
- [hooks](./hooks.md) - manage web hooks that trigger on object events
- [hiera](./hiera.md) - manage generic JSON data that can be fetched using Hiera HTTP

Additionally, the API provides a means to view commits for resources in SIS via the [Commits API](./commits.md)

All SIS objects can be referenced by some id that is unique within their type.

### SIS Fields

The SIS backend adds the following JSON fields to all resources:

* _id - persistent ID of the object - ObjectId
* __v - version of the object, primarily used by mongoose - Number
* _created_at - a UTC timestamp of when the object was created - Number
* _created_by - username of entity creator - String
* _updated_at - a UTC timestamp of when the object was last updated - Number
* _updated_by - username of last user who updated the entity - String

Additionally, SIS provides the following fields on all objects that authorized users may modify:

* sis_locked - indicates whether the object can be deleted - Boolean
* sis_immutable - indicates whether the object can be changed - Boolean
* sis_tags - an indexed array of Strings for arbitrary tagging - [String]
* owner - a list of groups that can modify or remove the object.

With the exception of `owner`, all SIS fields are prefixed with `_` or `sis_`.

# Endpoint API

All SIS resources expose an HTTP base endpoint.  The endpoint paths are versioned.
For instance, the base endpoint for the version 1 schemas API is `/api/v1/schemas`.

The following HTTP methods are common to all endpoints:

* GET <endpoint> - retrieve a list (page) of resources.  
See [List retrieval options](#list-retrieval-options) for options.
* GET <endpoint>/<resource id> - retrieve a single resource by id.
* POST <endpoint> - create a new resource, or multiple resources via [bulk insert](#bulk-insert).
* PUT <endpoint>/<resource id> - update a resource with the specified id.  [CAS operations](#cas-support) are also supported.
    * Note this operation will fail if `sis_immutable` is `true` for the resource.
    * Upsert is also
* DELETE <endpoint> - delete multiple resources via [bulk delete](#bulk-delete).
* DELETE <endpoint>/<resource id> - delete a single resource with the specified id.
    * Note this operation will fail if `sis_locked` is `true` for the resource.

Endpoints paths and id fields are documented in the resource specific documentation.

## List retrieval options

All GET requests that retrieve a list of objects support a variety of options specified via query parameters.

All list responses contain the `x-total-count` header which contains the total number of resources that match the search filter.

### Pagination

All lists retrieved are actually pages.  The following query parameters are used in pagination:

* limit - the number of items to fetch.  200 by default.  At most 200 items can be retrieved in a single call.
* offset - the number of items to skip before fetching.  0 based.

For instance, `GET /api/v1/schemas?limit=3&offset=4` retrieves the schemas at positions 3, 4, and 5.

### Field selection

Field selection is done by passing a comma separated list of field names in the `fields` parameter.  Dot notation may be used to specify the field of an embedded object.

For instance:

`GET /api/v1/schemas?fields=name,definition.name` returns a list of schemas where the objects only contain the name, _id, and the `name` field of the `definition`.  If `name` is not specified in the schema definition, the other two fields are still returned.

Note that `_id` is always returned.

### Sorting

To sort objects by a particular field, pass in the field name via the `sort` query parameter.  

For instance:

- `GET /api/v1/schemas?sort=name` returns schemas sorted by name in ascending order.  
- `GET /api/v1/schemas?sort=-name` returns schemas sorted by name in descending order.

### Search

Search / filtering is done by passing a URL encoded JSON object in the `q` parameter.
The object looks like a [MongoDB query document](http://docs.mongodb.org/manual/tutorial/query-documents/).

For instance:

`/api/v1/schemas?q={"owner":"SIS"}` returns a list of schemas where "SIS" is an owner.

#### Joins

Fields in the query objects may also apply to referenced objects as if they were a nested document.

For instance, consider the following schema definitions (only name and definition provided):

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

## Bulk Operations

All supported bulk operations return the following response with a 200
status.

```javascript
{
    success : [< objects >],
    errors : [< error objects >]
}
```

Error objects in the `errors` array look like the following:

```javascript
{
    err : [ status_code, error_body ],
    value : < object that caused the error >
}
```

Objects in the `success` array have the same format as the single operation variant.  Hooks are dispatched for all items in the success array as well.

### Bulk Insert

POST endpoints that support bulk insert also accept an array of objects instead of a single one.  When a non-empty array is sent, the following response is sent with a 200 response code.

An optional `all_or_none` URL query parameter can be added to the request and has a boolean value.  When `true`, any errors will prevent any inserts from occurring and the success array will return empty.

As an example, to insert 3 items in the `sample` schema defined in [Schema Objects](./schemas.md#schema-objects), issue `POST /api/v1/entities/sample` with the body

```javascript
[
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
    },
    {
        "stringField":    "sampleString2",
        "numberField" : 21,
        "uniqueNumberField" : 2,
        "requiredField" : "required string",
        "anythingField" : {
            "anything" : "goes",
            "in" : ["this", "field"]
         },
        "owner" : ["SISG1"]
    },
    {
        "stringField":    "sampleString3",
        "numberField" : 22,
        "uniqueNumberField" : 3,
        "requiredField" : "required string",
        "anythingField" : {
            "anything" : "goes",
            "in" : ["this", "field"]
         },
        "owner" : ["SISG1"]
    }
]
```

Note that SIS will **reject all requests where the payload exceeds 1MB**

### Bulk Delete

Bulk deletion requires a query with the same query format as those supplied in [search](#search).  Note that the DELETE is issued against the Endpoint base URL.

A query must be present, otherwise a 400 is returned.  Any errors that occur to some items do not prevent other objects from being deleted.

For instance, to delete all entities in the `sample` schema where the `numberField` is less than 20, issue the following request:

`DELETE /api/v1/entities/sample?q={"numberField" : {"$lt" : 20}}`

## CAS Support

CAS updates are supported on single object update calls only (i.e. `PUT /api/v1/schemas/my_schema` or `PUT /api/v1/entities/my_schema/the_object_id`).  CAS updates ensure that an update is applied atomically only if the object meets certain criteria.

To issue a CAS update operation, add the `cas` query parameter with the value being a query object representing the conditions the object must meet.

For instance, consider the following `sample` object that exists in SIS and can be retrieved via `GET /api/v1/entities/sample/some_object_id`:

```javascript
{
    "_id" : "some_object_id",
    "_updated_at" : 1404142960187,
    "stringField":    "some string",
    "numberField" : 100,
    "uniqueNumberField" : 1001,
    "requiredField" : "r",
    "anythingField" : { },
    "owner" : ["SISG1"]
    // some other SIS fields omitted
}
```

To update the object and set `numberField` to 101 only if `numberField` is 100, issue the following request:

`PUT /api/v1/entities/sample/some_object_id?cas={"numberField":100}` with the following body:

```javascript
{
    "numberField" : 101
}
```

Issuing the same call again will result in an error with status 400.

To further enhance the update condition, consider adding the `_updated_at` field to the condition.  The CAS condition then becomes: `{"numberField" : 100 , "_updated_at" : 1404142960187}`.

Note that it may not be sufficient to use only `_updated_at` as multiple writes may succeed within a millisecond.  The proper fields for the condition are left up to the application.

## Upserts

By default, SIS Endpoints support upsert on all PUT requests that take an ID.
Upsert operations create or modify an object depending on if an object exists with the specified ID.

The [entities]('./entities.md') API supports upsert only if the schema has `id_field` set to something other than `_id`.

The


# Data Sharing and Organization

There are many ways to manage data in SIS and organize it for collaboration and isolation.  Please see [Organizing Data in SIS](./docs/sharing.md).
