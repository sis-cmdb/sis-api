Table of Contents
=================

- [Users](#users)
	- [User objects](#user-objects)
	- [Groups](#groups)
	- [User permissions](#user-permissions)
	- [User API](#user-api)
		- [Retrieving users](#retrieving-users)
		- [Creating a new user](#creating-a-new-user)
		- [Updating a user](#updating-a-user)
		- [Deleting a user](#deleting-a-user)
- [Tokens](#tokens)
	- [Token Objects](#token-objects)
	- [Token API](#token-api)
		- [Retrieving tokens](#retrieving-tokens)
		- [Creating a temporary token](#creating-a-new-temporary-token)
		- [Creating a persistent token](#creating-a-new-persistent-token)
		- [Updating a token](#updating-a-token)
		- [Deleting a token](#deleting-a-token)
- [RBAC Examples](#rbac-examples)
	- [Users](#users-1)
		- [Permissions Matrix](#permissions-matrix)
	- [Schemas](#schemas)
		- [Permissions Matrix](#permissions-matrix-1)
	- [Entities](#entities)
		- [Permissions Matrix](#permissions-matrix-2)

SIS Role Base Access Control
============================

By default, the SIS API utilizes a form of RBAC to ensure that the user is
allowed to perform the action he is requesting.  RBAC requires the addition
of the users and tokens APIs.

For a successful RBAC deployment, the SIS API must be accessed via SSL.

# Users

A SIS user object contains authorization information for a particular user.  If the SIS authentication backend is used, it also contains teh password hash for authentication.

## User objects

User objects in SIS have the following schema definition:

```javascript
{
    // The username.  Required, unique, and lowercase alphanumeric w/ underscores
    "name" : {
        "type" : "String",
        "required" : true,
        "unique" : true,
        "match" :  "/^[a-z0-9_]+$/""
    },

    // The email address of the user.  Required
    "email" : {
        "type" : "String",
        "required" : true,
        "match": /^([\w-\.]+@([\w-]+\.)+[\w-]{2,4})?$/
    },

    // Future use.  Intended to mean the user's email has been verified
    "verified" : { "type" : "Boolean", "default" : false },

    // Whether the user is a super user
    "super_user" : { "type" : "Boolean", "default" : false },

    // Password hash of a user.  Only used if SIS authentication backend
    // is used
    "pw" : { "type" : "String" },

    // The roles object of a user.  See groups and permissions below
    "roles" : { "type" : "Mixed", "default" : { } }
}
```

The following is an example user with username `user_of_sis`:

```javascript
{
    "name" : "user_of_sis",
    "email" : "user@domain.com",
    "verified" : false,

    // not a super user
    "super_user" : false,
    "pw" : "hash_of_password",

    // user of "some_group", admin of "some_other_group"
    "roles" : { "some_group" : "user",
                "some_other_group" : "admin"
              }
}
```

## Groups

A group in SIS is only identified by a string.  The `owner` field in an object
represent an array of groups that can act upon it.  The `roles` object in a
user maps a group to a permission.  A user can belong to many groups and have
a different role in each group as seen above.

## User permissions

There are currently three levels of permissions:

* super user - a user that can modify any object in SIS and modify any
user with any privileges.

* admin - the admin privilege applies only at a group level.  A group admin
may remove or add a permission for another user for a role he administers.
For instance, the above user can add a user or admin to the 'some_other_group'
for another user.  Additionally, an admin may add/delete/update any schema that
he administers, assuming he is an admin for all groups associated with that
schema.  A detailed example is at the bottom of this page.  Admins can also
do everything a user can do, as described in the next bullet.

* user - a user of a group may do the following:
  * create/add/modify/update an entity where he has user permission for all
    entity owners (or schema owners if entity `owner` is not present) associated
    with the object.
  * create/add/modify/update hooks and hiera entries where he has user
    permission for all of the entries in the object's `owner` field.

In addition to super users, a user can change his own password and email address.

## User API

The following sections describe the User API.  Note that the User API does not
support the commits API.  The password hash is ommitted in all responses.

All modification requests will error if the user identified by the `x-auth-token`
has insufficient rights for modifying the user.

### Retrieving users

* `GET /api/v1/users`
* `GET /api/v1/users/:name`

If no name is specified in the path, returns a list of user objects.

The name must contain only lowercase ascii characters, digits, or underscores.

### Creating a new user

* `POST /api/v1/users`

The request body must be a valid user object.  This method will error if a user with the same name exists.

The response is the user object along with two additional fields assigned by mongoose:

### Updating a user

* `PUT /api/v1/users/:name`

The request body must be a valid user object.  The name in the user object must match the name in the path parameter.
This implies that user names cannot be changed.

The response is the updated user object.

### Deleting a user

* `DELETE /api/v1/users/:name`

Removes the user with the specified name along with all tokens associated with the user.

# Tokens

SIS requires every modification API call (PUT/POST/DELETE) to include a
`x-auth-token` header unless otherwise noted.  The token is a random
string generated by SIS that can be tied back to a user.  There are
two types of tokens in SIS:

* Temporary Token - a temporary token is retrieved for a user via an API
call containing the user's username and password via Basic Auth.  Temporary
tokens expire 8 hours after they are created.

* Persistent Token - a persistent token can be created by using either a
temporary token or another persistent token.  Persistent tokens are geared
towards services that act without human intervention.  Super users cannot
have any persistent tokens.

All tokens are tied back to a user and assume the privileges of that user.
A token in SIS is represented by the following JSON:

## Token Objects

Tokens in SIS have the following schema definition:

```javascript
{
    // Unique token name.  This is the field that is sent in the `x-auth-token` header.
    name : { type : "String", unique : true },
    // An optional description of the token.  Useful for permanent tokens meant for services.
    desc : "String",
    // Number of milliseconds left before the token expires.  Only applicable to
    // temporary tokens
    expires : { type : "Date", expires : 0 },
    // The username this token belongs to
    username : { type: "String", required : true }
}
```

A temporary token for "user_of_sis" might look like the following:

```javascript
{
    "name" : "token_identifier"
    "expires" : 10000,
    username : "user_of_sis"
}
```

## Token API

The following sections describe the Token API.  Note that the Token API does not
support the commits API.

All modification requests will error if the user identified by the `x-auth-token`
has insufficient rights for retrieving and/or modifying the token.

All methods in the Tokens API, with the exception of the temporary token request
require the `x-auth-token` to be present.

### Retrieving tokens

* `GET /api/v1/users/:uname/tokens`
* `GET /api/v1/users/:uname/tokens/:name`

Retrieve the tokens of a particular user.  This method returns tokens of the user
identified by `uname`.  These methods will return an unauthorized status code
if the user identified by `x-auth-token` does not have administration rights on
all roles assigned to the user identified by `uname`.

### Creating a new temporary token

Note that this method does not require the `x-auth-header` and a `Content-Type`
header MUST not be set.  The request must contain an `Authorization` header
containing the username and password the token is requested for.  See the
[Basic Auth](http://tools.ietf.org/html/rfc1945#section-10.2) spec for more
information.

* `POST /api/v1/users/auth_token`

The request body must be empty.  The result is a token with the expires field
set to the number of milliseconds until the token expires.

### Creating a new persistent token

* `POST /api/v1/users/:uname/tokens`

The request body must be a valid JSON object.  It can be an empty JSON object.
It is recommended that the object contain the `desc` field for organizational
purposes.

The username is automatically set to the value in :uname.  Setting the `expires`
field has no effect.

### Updating a token

* `PUT /api/v1/users/:uname/tokens/:name`

The same rules apply as the POST method.  The token name cannot be changed.

### Deleting a token

* `DELETE /api/v1/users/:name`

Removes the user with the specified name along with all tokens associated with the user.

# RBAC Examples

This section is meant to illustrate the way RBAC works within SIS as a quick reference.
Entity representations display only relevant information.

## Users

The examples use a naming convention for relating users to roles.  For example,
`g1_admin` defines a user who is an admin of group `g1`.  `g1_admin_g2_user`
identifies a user who is an admin of group `g1` and a user of group `g2`.

### Permissions Matrix

|                 | Add g1 role on user     | Add g2 role on user     | Create a user with g1 and g2 roles |
|:----------------|:-----------------------:|:-----------------------:|:--------------------------------------:|
|g1_admin         |x                        |                         |                                        |
|g2_admin         |                         |x                        |                                        |
|g2_admin_g1_user |                         |x                        |                                        |
|g2_admin_g1_admin|x                        |x                        |x                                       |
|g1_user_g2_user  |                         |                         |                                        |
|super_user       |x                        |x                        |x                                       |


## Schemas

The following schemas are used in the examples:

```javascript
// schema with owners g1 and g2
{
    name : "sch_g1_g2",
    owner : ["g1", "g2"],
    definition : {
        // entity definition goes here
    }
}

// schema with owners g1
{
    name : "sch_g1",
    owner : ["g1"],
    definition : {
        // entity definition goes here
    }
}
```

### Permissions Matrix

|                 | Create/modify sch_g1_g2     | Create/modify sch_g1     | Add g2 as owner of sch_g1| Remove g1 as an owner of sch_g1_g2 |
|:----------------|:---------------------------:|:------------------------:|:------------------------:|:----------------------------------:|
|g1_admin         |                             |x                         |x                         |                                    |
|g2_admin         |                             |                          |                          |                                    |
|g2_admin_g1_user |                             |                          |                          |                                    |
|g2_admin_g1_admin|x                            |x                         |x                         |x                                   |
|g1_user_g2_user  |                             |                          |                          |                                    |
|super_user       |x                            |x                         |x                         |x                                   |


## Entities

The following entities are used in the examples.  The schema they belong
to is specified in the `schema` field.

```javascript
// entity belonging to sch_g1_g2
{
    _id : "e_g1_g2",
    schema : "sch_g1_g2"
    // owners default to the schema owners (g1 and g2)
}

// entity belonging to sch_g1_g2, but with subset of owners
{
    _id : "e_g1",
    schema : "sch_g1_g2",
    owner : ["g1"]
}
```

### Permissions Matrix

|                 | Create/modify e_g1_g2       | Create/modify e_g1       |
|:----------------|:---------------------------:|:------------------------:|
|g1_admin         |                             |x                         |
|g2_admin         |                             |                          |
|g1_user          |                             |x                         |
|g2_user          |                             |                          |
|g2_admin_g1_user |x                            |x                         |
|g2_admin_g1_admin|x                            |x                         |
|g2_user_g1_admin |x                            |x                         |
|g2_admin_g1_admin|x                            |x                         |
|g2_user_g1_user  |x                            |x                         |
|super_user       |x                            |x                         |


Note that that `g3` cannot be an owner of `e_g1` because the schema `sch_g1_g2` does not have `g3` as an owner.
