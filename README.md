Table of Contents
=================

- [Description](#description)
- [Requirements](#requirements)
- [Building and Testing](#building-and-testing)
- [Configuration](#configuration)
    - [Authentication Backends](#authentication-backends)
        -[Default Backend](#default-backend-configuration)
        -[Active Directory over LDAP](#active-directory-over-ldap)
- [Running in Containers](#running-in-containers)
- [Tools](#tools)
    - [Creating Users](#creating-users)
    - [Deleting Users](#deleting-users)
- [LICENSE](#license)
- [REST API Documentation](#rest-api-documentation)

# Description

The Service Information System (SIS) is a CMDB alternative designed with
collaboration and customizability in mind.  Access to all data is strictly via
the familiar principles of REST over HTTP.

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

More details can be found in the [API Documentation](./docs/index.md)

# Requirements

The following are required to build and run SIS:

- [Node.js](https://nodejs.org/) 20 or later (see the `engines` field in `package.json`).
- [MongoDB](https://www.mongodb.org/) 4.4+ (tested against MongoDB 7).

If you would rather not install these locally, see
[Running in Containers](#running-in-containers) to run the API and MongoDB with
`podman` / `docker`.

# Building and Testing

SIS uses npm scripts for its tooling: [Mocha](https://mochajs.org/) for tests,
[ESLint](https://eslint.org/) for linting, and [c8](https://github.com/bcoe/c8)
for coverage. (The former grunt + jshint + blanket stack has been removed.)

1. Ensure a local MongoDB instance is running on port 27017.
    - `mongod --dbpath=/data --port 27017` will launch a mongo server listening on 27017 and writing data to `/data`.
    - Alternatively, start one in a container (see [Running in Containers](#running-in-containers)).
2. From the root directory, run `npm install`.
3. Run `npm run gen-jwt-key` once to create the key pair used to sign session
   tokens (see [Session Tokens](#session-tokens-jwt)).
4. Run `npm start` (or `node server.js`) to start the server. The main file is `server.js`.

The available npm scripts are:

- `npm start` - run the server (`node server.js`).
- `npm test` - run the Mocha suite (config in `.mocharc.yml`).
- `npm run lint` - run ESLint (flat config in `eslint.config.js`).
- `npm run coverage` - run the test suite under `c8` and emit an HTML + text report.
- `npm run build` - generate `build.json` (consumed by the `/info` endpoint).
- `npm run gen-jwt-key [kid]` - generate an Ed25519 key pair in `conf/keys/` for signing session tokens.

## Running the tests

The test suite connects to `mongodb://localhost/sis-test` by default. Override
the connection string with the `db__url` environment variable (`nconf` reads
`__` as the nested-key separator):

```bash
db__url="mongodb://localhost:27018/sis-test" npm test
```

To run a single spec, list `test/init-tests.js` first (it starts the shared
server and seeds a superuser) followed by the target spec:

```bash
db__url="mongodb://localhost/sis-test" ./node_modules/.bin/mocha --timeout 60000 \
  test/init-tests.js test/v1.1-api/test-api-entities.js
```

Relevant environment variables:

- `SIS_RUN_LONG_TESTS=true` - enable the longer/replication suites.
- `SIS_REMOTE_URL` - run the suite against a remote SIS instead of spawning a local server.
- `db__url` - override the MongoDB connection string for a run.

# Configuration

The default configuration lives in `conf/config.json`. Settings are resolved
with the following precedence (highest first):

1. Environment variables (`nconf` reads `__` as the nested-key separator, so
   `db.url` is set via `db__url`; values are parsed as JSON).
2. Command-line arguments.
3. `conf/config.json.local` - an optional, git-ignored file for local overrides.
4. `conf/config.json` - the committed defaults.

An annotated `config.json` looks like:

```javascript
{
    // database specific configuration
    "db": {
        // a mongo db connection string
        "url" : "mongodb://localhost/sis"
    },
    // server specific config
    "server" : {
        // the tcp port to listen on
        "port" : 3000
    },
    // application specific settings
    "app" : {
        // whether Role Based Access Control is enabled.  Defaults to true
        "auth" : true,
        // whether read (GET) requests also require a valid API token.
        // Requires "auth" to be true.  Defaults to false (reads are public)
        "auth_reads" : false,
        // authentication backend config.  See below
        // defaults to a sis backend.
        "auth_config" : {
            // specific info per backend
        },
        // session token (JWT) settings.  See "Session Tokens" below
        "jwt" : {
            // key id used to sign new session tokens.  Defaults to "default"
            "active_kid" : "default",
            // directory holding jwt-<kid>.key / jwt-<kid>.pub, relative to
            // conf/ unless absolute.  Defaults to "keys" (conf/keys)
            "keys_dir" : "keys",
            // session length in ms.  Defaults to 8 hours
            "ttl_ms" : 28800000,
            // the iss claim.  Defaults to "sis"
            "issuer" : "sis"
        },
        // whether the app only serves read requests (GET).  Defaults to false
        "readonly" : false,
        // whether to enable custom scripts support
        "scripts_enabled" : false,
        // minimum workers to run scripts in pool
        "scripts_min" : 1,
        // maximum workers to run scripts in pool
        "scripts_max" : 2,
        // time that a worker can remain idle before being collected
        "script_worker_idle_time_ms" : 300000,
        // use the cluster module
        "use_cluster" : true,
        // optional read preference to use on GET requests
        "get_read_pref" : "nearest"
    },
    // default logger options - see bunyan configuration
    "logger" : {
        "options" : {
            "name" : "SIS",
            "level" : "debug",
            "streams" : [{
                "path" : "./sis.log"
            }]
        }
    },
}
```

## Authentication Backends

### Default Backend

The default backend authenticates a user against a password stored with the user object.  Password hashes are stored in SIS if this backend is used.  Configure using:

```javascript
"auth_config" : {
    "type" : "sis"
}
```

### Active Directory over LDAP

The LDAP authentication backend authenticates a user by attempting an LDAP bind
with their credentials. When a user successfully authenticates for the first
time, the backend creates an empty User object with no privileges.

Configure the backend using:

```javascript
"auth_config" : {
    "type" : "ldap",
    "url" : "<url of the LDAP endpoint>",
    "user_domain" : "<the user domain to authenticate against>",
    "email_domain" : "<the domain to append as the email address for the user>",
    "client_opts" : {
        "option_1" : "option_1_value"
        // etc.  These are options passed to the ldapts Client constructor:
        // https://github.com/ldapts/ldapts
    }
}
```

By default SIS binds using an Active Directory userPrincipalName, i.e.
`<user>@<user_domain>`. For example, with:

```javascript
"auth_config" : {
    "type" : "ldap",
    "url" : "ldap://10.1.1.1",
    "user_domain" : "ad.corp.com",
    "email_domain" : "company.com"
}
```

An authentication request for `user1` will attempt to bind as `user1@ad.corp.com`
and create the user `user1` with email `user1@company.com` if successful and does
not already exist.

#### Binding by full DN (non-AD directories)

Directories such as OpenLDAP bind by a full distinguished name rather than a
userPrincipalName. For those, set `bind_dn_template` instead of (or in addition
to) `user_domain`. The `%u` placeholder is replaced with the (DN-escaped) login
name:

```javascript
"auth_config" : {
    "type" : "ldap",
    "url" : "ldap://openldap:1389",
    "email_domain" : "example.org",
    "bind_dn_template" : "cn=%u,ou=users,dc=example,dc=org"
}
```

An authentication request for `user1` then binds as
`cn=user1,ou=users,dc=example,dc=org`. When `bind_dn_template` is set,
`user_domain` is optional. See
[Trying the LDAP backend](#trying-the-ldap-backend) for a ready-to-run example.

## Session Tokens (JWT)

`POST /api/v1.1/users/auth_token` returns a session token: a JWT signed with an
Ed25519 key, valid for 8 hours by default. Session tokens are not stored in the
database; persistent API tokens (`/users/:name/tokens`) are unchanged. Either
kind can be sent in the `x-auth-token` header or as `Authorization: Bearer <token>`.
See [Tokens](docs/users.md#tokens) for the API.

The signing keys are stored alongside the configuration:

```
conf/
  config.json
  keys/
    jwt-default.key   (private key, mode 0600, git-ignored)
    jwt-default.pub   (public key)
```

Create them with:

```bash
npm run gen-jwt-key            # writes conf/keys/jwt-default.key and .pub
```

(With Compose the keys are created for you; see
[Running in Containers](#running-in-containers).)

The server refuses to start when authentication is enabled and the private key
for `app.jwt.active_kid` is missing, and logs a warning if that file is readable
by group or others. Every `jwt-*.pub` file in `keys_dir` is trusted for
verification. In clustered or replicated deployments, every server must have
the same key files. Servers running with `"readonly" : true` need only the
`.pub` files; without a private key they cannot hand out sessions.

### Rotating the signing key

1. Generate a new pair with a new key id: `npm run gen-jwt-key 2027-01`.
2. Copy `jwt-2027-01.pub` to every server, then `jwt-2027-01.key` to the servers
   that issue sessions.
3. Set `app.jwt.active_kid` to `2027-01` (or `app__jwt__active_kid`) and restart.
   Existing sessions keep working because the old `.pub` is still present.
4. After the session length (8 hours) has passed, delete the old `.key` and `.pub`.

### Ending sessions

`DELETE /api/v1.1/users/auth_token` ends every session of the calling user.
Changing a user's password, or deleting the user, also ends their sessions.
Role changes take effect on the next request.

# Running in Containers

SIS ships with a `Dockerfile` and a `compose.yaml` so the API and its MongoDB
dependency can be run as containers. The examples below use `podman` /
`podman compose`; substitute `docker` / `docker compose` if you prefer - the
files are compatible with both.

## Quick start with Compose

`compose.yaml` runs `mongo` (MongoDB 7), `sis-api` (this app), and `sis-keys`, a
one-shot job that creates the [session signing keys](#session-tokens-jwt) on
the first start and does nothing on later starts. The API waits for MongoDB to
report healthy and for `sis-keys` to finish before starting.

```bash
# Build the image and start the services in the background
podman compose up -d --build

# Follow the API logs (JSON, written to stdout)
podman compose logs -f sis-api

# Stop the stack (add -v to also delete the MongoDB data volume)
podman compose down
```

Once up, the API listens on `http://localhost:3000`:

```bash
curl -I http://localhost:3000/            # -> 200
curl http://localhost:3000/api/v1.1/info  # -> build/version info
```

The signing keys live next to the config at `/app/conf/keys`, stored in the
named `sis_keys` volume (mounted read-only into `sis-api`). `conf/keys/` is
excluded from the image by `.dockerignore`, so private keys never end up in an
image layer. To rotate, generate a new pair into the volume and set
`app__jwt__active_kid` on `sis-api`:

```bash
podman compose run --rm sis-keys node scripts/gen-jwt-key.js 2027-01
```

To manage the key files yourself instead, replace the volume with a bind mount
of a host directory. The files must be readable by the container's `node` user
(uid 1000), so `chown 1000` the private key rather than loosening its mode.

MongoDB data persists in the named `mongodb_data` volume. By default MongoDB is
reachable only by the `sis-api` service over the internal Compose network and is
not published to the host; uncomment the `ports` block on the `mongo` service in
`compose.yaml` if you need to connect to it directly.

## Configuration via environment variables

The image contains the default `conf/config.json`. Rather than editing files,
override individual settings with environment variables: `nconf` reads env vars
using `__` as the nested-key separator, so `db.url` becomes `db__url`,
`server.port` becomes `server__port`, and so on. Values are parsed as JSON, so
`"false"` and `"3000"` become a boolean and a number respectively.

`compose.yaml` uses this to point the API at the `mongo` service and to run a
single process per container:

```yaml
environment:
  db__url: "mongodb://mongo:27017/sis"
  server__port: "3000"
  app__use_cluster: "false"
```

`app.use_cluster` is disabled in containers because the cluster module forks a
worker per host CPU (ignoring container CPU limits); run one process per
container and scale with replicas instead.

## Building the image directly

```bash
podman build -t sis-api:latest .

# create the session signing keys in a volume (once)
podman run --rm -v sis_keys:/app/conf/keys sis-api:latest \
  node scripts/gen-jwt-key.js --if-missing

podman run --rm -p 3000:3000 \
  -e db__url="mongodb://my-mongo-host:27017/sis" \
  -v sis_keys:/app/conf/keys:ro \
  sis-api:latest
```

The build generates `build.json` (served by the `/info` endpoint). Pass
`--build-arg BUILD_NUMBER=... --build-arg GIT_COMMIT_HASH=...` to stamp CI build
metadata into the image.

The image runs as the non-root `node` user and sets `STOPSIGNAL SIGINT` so that
`podman stop` / `docker stop` triggers the server's graceful-shutdown handler.

> **Note:** MongoDB runs without authentication in the default `compose.yaml`,
> which matches the credential-less `db.url` and is fine for local development.
> For a deployment that requires auth, enable it on the `mongo` service and put
> the credentials in `db__url` (e.g. `mongodb://user:pass@mongo:27017/sis?authSource=admin`).

## Trying the LDAP backend

An optional overlay, `compose.ldap.yaml`, adds a throwaway OpenLDAP server
(seeded with a `user1` / `pass1` account) and switches `sis-api` to the
[LDAP auth backend](#active-directory-over-ldap). It is kept separate so the
default `podman compose up` stays on the built-in `sis` backend.

Start the stack with both files:

```bash
podman compose -f compose.yaml -f compose.ldap.yaml up -d --build
```

Then mint a token as the seeded directory user to confirm LDAP auth works:

```bash
curl -u user1:pass1 -X POST http://localhost:3000/api/v1.1/users/auth_token
# -> 201 with a session token (a JWT in "name"); SIS auto-creates the user1
#    account on first login
```

The overlay points SIS at the LDAP server with a bind-DN template (see
[Binding by full DN](#binding-by-full-dn-non-ad-directories)):

```yaml
app__auth_config__type: "ldap"
app__auth_config__url: "ldap://ldap:1389"
app__auth_config__email_domain: "example.org"
app__auth_config__bind_dn_template: "cn=%u,ou=users,dc=example,dc=org"
```

This overlay is for local development only. It uses Bitnami's frozen
`bitnamilegacy/openldap` image and ships throwaway credentials in the compose
file; do not use it as-is in production.

# Tools

This section documents some tools provided in the source.

## Creating Users

After SIS is up and running, creating an initial super user is the next logical step.  The initial user must be created via command line as there are no users who are permitted to use the REST API.  To create a super user, create a json file that looks like the following:

```javascript
{
    "name" : "a_super_user",
    "pw" : "super_user_pw",
    "email" : "super@user.com",
    "super_user" : true
}
```

Then run `node tools/useradmin.js update /path/to/json/file`

## Deleting Users

Similar to creating a user, create a JSON file with the following contents

```javascript
{
    "name" : "user_to_delete"
}
```

Then run `node tools/useradmin.js delete /path/to/json/file`

# LICENSE

This software is licensed under the BSD 3-Clause license.  Please refer to the [LICENSE](./LICENSE) for more information.

# REST API Documentation

Detailed documentation can be found in the [docs](./docs/index.md) folder.
