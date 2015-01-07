Table of Contents
=================

- [Hooks API](#hooks-api)
    - [Hook Objects](#hook-objects)
    - [Hook payloads](#hook-payloads)
    - [Retrieving hooks](#retrieving-hooks)
    - [Creating a new hook](#creating-a-new-hook)
    - [Updating a hook](#updating-a-hook)
    - [Deleting a hook](#deleting-a-hook)


# Hooks API

Hooks allow users to receive notifications when objects are inserted, updated, and deleted from the SIS database.

## Hook Objects

A hook can be represented by the following schema definition:

```javascript
{
    // The name of the schema.  Required and Unique across all schemas.
    // Must be all lowercase alphanumeric and underscores
    "name" : {
        "type" : "String", "required" : true,
        "unique" : true, "match" : "/^[a-z0-9_]+$/"
    },
    // Defines the target URL that SIS calls out to
    // It is an object with three fields
    // - url - required string that is the URL to call out to
    // - action - HTTP method to use.  One of "GET", "POST", "PUT".
    "target" : {
            "type" : {
                "url" : { "type" : "String", "required" : true },
                "action" : {
                             "type" : "String", "required" : true,
                             "enum" : ["GET", "POST", "PUT"]
                           }
            },
            "required" : true
    },
    // The number of times to retry calling this hook before giving up.  Defaults to 0.
    // Max number of times is 20.
    "retry_count" : { "type" : "Number", "min" : 0, "max" : 20, "default" : 0 },

    // The number of seconds between retries.  The longest delay is 60 seconds.
    // Defaults to 1 second
    "retry_delay" : { "type" : "Number", "min" : 1, "max" : 60, "default" : 1 },

    // The events that trigger this hook.  Any combination of "insert",
    // "update", or "delete".  Determines if the hook should be fired
    // when an object is created, updated, or deleted.
    "events" : {
        "type" : [{ "type" : "String", "enum" : ["insert", "update", "delete"] }],
        "required" : true
    },

    // The entity type that the hook is interested in.  May be a schema name or one of:
    // - sis_schemas - type for schemas
    // - sis_hiera - type for heira entries in SIS
    "entity_type" : { "type" : "String", "required" : true },

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

## Hook payloads

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

## Retrieving hooks

* `GET /api/v1.1/hooks` - returns a list of hook objects
* `GET /api/v1.1/hooks/:name` - returns a hook with the specified name

## Creating a new hook

* `POST /api/v1.1/hooks`

The request body must be a valid hook object.  This method will error if a hook with the same name exists.

The response is the created hook.

Error cases:

* An entry with the same name already exists.
* Validation failure
* Authorization failure

## Updating a hook

* `PUT /api/v1.1/hooks/:name`

The request body must be a valid hook object.  The name in the hook object must match the name in the path parameter.  This implies that hook names cannot be changed.

The response is the updated hook object.

Error cases:

* Any errors from create
* The name in the payload does not match the name in the path.
* The hook does not exist
* `sis_immutable` is true

## Deleting a hook

* `DELETE /api/v1.1/hooks/:name`

Removes the hook with the specified name.

The response is the deleted hook.

Error cases:

* `sis_locked` is true
* The hook does not exist
* Authorization failure
