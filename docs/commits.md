Table of Contents
=================

- [Revisions and Commit Log support](#revisions-and-commit-log-support)
    - [Commit Objects](#commit-objects)
    - [Retrieving the commits of an object](#retrieving-the-commits-of-an-object)
    - [Retrieving an individual commit](#retrieving-an-individual-commit-of-an-object)
    - [Retrieving an object at a particular time](#retrieving-an-object-at-a-particular-time)
    - [Example commit log](#example-commit-log)

# Revisions and Commit Log support

SIS tracks changes on all objects (schemas, entities, hooks, and hiera) and provides an API for viewing all commits on an object and what the state of an object looked like at a moment in time.

## Commit Objects

A commit object has the following schema definition:

```javascript
{
    // The type of object
    "type" : "String",

    // The id of the object (depends on the type)
    "entity_id" : "String",

    // The type of action this commit logs.  One of update, insert, or delete
    "action" : {"type" : "String", "required" : true, enum : ["update", "insert", "delete"]},

    // If insert, the new object
    // If update, the patch from [JsonDiffPatch](https://github.com/benjamine/JsonDiffPatch)
    // If delete, null
    "commit_data" : "Mixed",

    // same as the _updated_at value of the entity that was saved
    "date_modified" : { "type" : "Number" },

    // username of the user who modified it
    "modified_by" : "String"
}
```

The `type` field is either a schema name (added via the schemas API) or one of the following:

* sis_schemas - an actual schema object
* sis_hiera - a hiera object
* sis_hooks - a hook object

The `entity_id` field is the value of the `_id` field in entities, and the `name` field in all internal SIS objects.

All commits also have an _id field used for retrieval purposes.

## Retrieving the commits of an object

All individual objects in SIS have a getter by id.  For instance, a hook is retrieved via: `/api/v1.1/hooks/:hook_name`.  To get the commits on an object, simply append `/commits` to the path.

The commits API follows the same pagination rules and filtering abilities of all list retrieval APIs.

As an example, to retrieve a list of commits on a hook with name "my_hook", issue a GET request against `/api/v1.1/hooks/my_hook/commits`.

To retrieve a list of commits on an entity of type 'my_type' with `_id` 1234, issue a GET request against `/api/v1.1/entities/my_type/1234/commits`.

## Retrieving an individual commit of an object

To retrieve an individual commit, append the `_id` of the commit object to the commits URL.  The returned object is a commit object with an additional field - `value_at`.  The `value_at` field is the actual state of the object at that mooment in time.

## Retrieving an object at a particular time

To retrieve an object's state at a particular time, append `/revisions/:utc_timestamp` to the getter path of that object.  This returns the object at that time.  Note that the timestamp is in millis.

For example, to retrieve the `my_hook` object at 11/11/11 @ 11:11:11 (utc timestamp 1321009871000), issue the request `/api/v1.1/hooks/my_hook/revisions/1321009871000`

Timestamps in the future will return the current object.  Timestamps in the past return 404.

Note that a commit object is not returned, but rather the object itself.

## Example commit log

The following is a commit log for a hiera entry that was added, updated, and deleted by user1.

```javascript
[
// initial add of object
{
    "type": "sis_hiera",
    "entity_id": "hiera_entry",
    "action": "insert",
    "modified_by": "user1",
    "commit_data": {
        "_v": 0,
        "_updated_at": 1385599521199,
        "name": "hiera_entry",
        "hieradata": {
            "field_n": 0,
            "field": "v1"
        },
        "_id": "529692213a74002bdf000003",
        "_created_at": 1385599521199,
        "_sis" : { "owner": ["group1"] }
    },
    "date_modified": 1385599521199,
    "_id": "529692213a74002bdf000004",
    "_v": 0,
    "_sis" : {
        "_created_at": 1385599521200,
        "_updated_at": 1385599521201
    }
},
// update
{
    "type": "sis_hiera",
    "entity_id": "hiera_entry",
    "action": "update",
    "modified_by": "user1",
    "commit_data": {
        "_updated_at": [1385599521199, 1385599522218],
        "hieradata": {
            "new_field": ["new"],
            "field": ["v1", 0, 0],
            "field_n": [0, 0, 0]
        }
    },
    "date_modified": 1385599522218,
    "_id": "529692223a74002bdf000005",
    "_v": 0,
    "_sis" : {
        "_updated_at": 1385599522221,
        "_created_at": 1385599522220
    }
},
// deletion
{
    "type": "sis_hiera",
    "entity_id": "hiera_entry",
    "action": "delete",
    "modified_by": "user1",
    "commit_data": {
        "_updated_at": 1385599522218,
        "name": "hiera_entry",
        "hieradata": {
            "field": "v1",
            "field_n": 0
        },
        "_id": "529692213a74002bdf000003",
        "_v": 0,
        "_created_at": 1385599521199,
        "_sis" : { "owner": ["group1"] }
    },
    "date_modified": 1385599523236,
    "_id": "529692233a74002bdf000006",
    "_v": 0,
    "_sis" : {
        "_created_at": 1385599523236,
        "_updated_at": 1385599523236
    }
}]
```
