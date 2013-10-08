sis-web
=======

# API Description

Every API method described below returns data with `Content-Type: application/json`.

## Schema API

Manage schemas of all entities in the system.  A sample schema object looks like:

```json
{
    // The name of the schema
    "name" : "Sample Schema",
    // A definition of what entities will look like
    // leveraging mongoose syntax 
    "definition" : {
        "stringField":    "String",
        "numberField" : "Number",
        "anythingField" : { },
        "dateField" : "Date"
    }
}
```

Please consult the [mongoosejs schematypes doc][http://mongoosejs.com/docs/schematypes.html] for more information on what the definition object may look like.

### Reading schemas

* `GET /api/v1/schemas`
* `GET /api/v1/schemas/:name`

If no name is specified in the path, returns a list of schema objects.

### Creating a new schema

* `PUT /api/v1/schemas`

The request body must be a valid schema object.  This method will error if a schema with the same name exists.

The response is the schema object along with two additional fields:


| HTTP Method | URI             | Action                            |
|-------------|-----------------|-----------------------------------|
| GET    | /api/v1/schemas      | List all of the schemas           |
| GET    | /api/v1/schemas/:id  | Display the specified schema      |
| PUT    | /api/v1/schemas/:id  | Update the specified schema       |
| POST   | /api/v1/schemas      | Create a new schema               |
| DELETE | /api/v1/schemas/:id  | Delete the specified schema       |



### URIs

| GET    | /api/v1/entities     | List all of the objects           |
| GET    | /api/v1/entities/:id | Display the specified object      |
| PUT    | /api/v1/entities/:id | Update the specified object       |
| POST   | /api/v1/entities     | Create a new object               |
| DELETE | /api/v1/entities/:id | Delete the specified object       |
| GET    | /api/v1/hooks        | List all of the web hooks         |
| GET    | /api/v1/hooks/:id    | Display the specified web hook    |
| PUT    | /api/v1/hooks/:id    | Update the specified web hook     |
| POST   | /api/v1/hooks        | Create a new web hook             |
| DELETE | /api/v1/hooks/:id    | Delete the specified web hook     |
| GET    | /api/v1/hiera        | List all of the hiera entries     |
| GET    | /api/v1/hiera/:key   | Display the specified hiera entry |
| PUT    | /api/v1/hiera/:key   | Update the specified hiera entry  |
| POST   | /api/v1/hiera        | Create a new hiera entry          |
| DELETE | /api/v1/hiera/:key   | Delete the specified hiera entry  |

## Developer Info

### Frameworks
- express web framework
- mocha testing
- jade templating

### Project Layout
- server.js - main server
- routes/ - routes go here.  server.js will bootstrap them.  different files for different API bases (devices, vips, etc.)
- test/ - mocha tests
- public/ - static files
- views/ - jade templates

