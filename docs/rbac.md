Table of Contents
=================
- [SIS Role Based Access Control](#sis-role-based-access-control)
- [RBAC Examples](#rbac-examples)
	- [Users](#users-1)
		- [Permissions Matrix](#permissions-matrix)
	- [Schemas](#schemas)
		- [Permissions Matrix](#permissions-matrix-1)
	- [Entities](#entities)
		- [Permissions Matrix](#permissions-matrix-2)

SIS Role Based Access Control
=============================

By default, the SIS API utilizes a form of RBAC to ensure that the user is
allowed to perform the action he is requesting.  RBAC requires the addition
of the users and tokens APIs.

For a successful RBAC deployment, the SIS API must be accessed via SSL.

The concepts discussed here are directly related to the [User and Token APIs](./users.md)

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
|g1_admin         |                             |x                         |                          |                                    |
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
