# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

SIS (Service Information System) is a CMDB alternative: a REST-over-HTTP API where
clients define their own object types (`schemas`) and then CRUD instances of them
(`entities`), with change history (`commits`), webhooks (`hooks`), key/value config
(`hiera`), RBAC, and optional custom server-side `scripts`. It is an Express 5 app
on modern Node (LTS, `engines: node >=20`) backed by MongoDB via Mongoose 8.

## Commands

Prereq: a local MongoDB on `localhost:27017` must be running for the server and the
full test suite. The test suite connects to `mongodb://localhost/sis-test`; override
with the `db__url` env var (nconf reads `__` as the nested-key separator), e.g.
`db__url="mongodb://localhost:27018/sis-test" npm test`.

- `npm install` - install deps (lockfile: `package-lock.json`).
- `npm start` / `node server.js` - run the server.
- `npm test` - run the mocha suite (config in `.mocharc.yml`).
- `npm run lint` - run eslint (flat config in `eslint.config.js`).
- `npm run coverage` - mocha under `c8`.
- `npm run build` - generate `build.json` (consumed by the `/info` endpoint).

The build/test tooling was migrated off the obsolete grunt + jshint + blanket stack
to npm scripts + `mocha` + `eslint` + `c8`. `.mocharc.yml` wires in two preload
modules: `scripts/gen-build-info.js` (writes `build.json`) and
`test/fixtures/promise-compat.js` (a test-only `Promise.prototype.nodeify`/`.done`
shim - the managers used to return bluebird promises; this keeps the existing
callback-bridge assertions working without touching production code).

### Running a single test

Tests use Mocha + `should` + `supertest`. `test/init-tests.js` should be listed first
because it starts the shared local server (via `test/fixtures/util.js` →
`server.startServer`) and seeds a `sistest_super` superuser; other specs reuse it.

```
db__url="mongodb://localhost/sis-test" ./node_modules/.bin/mocha --timeout 60000 \
  test/init-tests.js test/v1.1-api/test-api-entities.js
```

Relevant env vars:
- `SIS_RUN_LONG_TESTS=true` - enables the longer/replication suites.
- `SIS_REMOTE_URL` - point the suite at a remote SIS instead of spawning a local server.
- `db__url` - override the MongoDB connection string for a run.

## Architecture

The system is a strict three-layer stack. When adding or changing a resource, you
almost always touch a route + a manager, not raw Express/Mongoose.

1. **Routes / Controllers** (`routes/*.js`) - HTTP layer. Every route module exports
   `setup(app, config)`. Each defines a subclass of **`routes/apicontroller.js`**
   (`ApiController`) and calls `controller.attach(app, "/<base>")`. `attach` mounts the
   CRUD verbs under a version-prefixed path (`/api/:version(v1|v1.1)/<base>`), wraps all
   mutating verbs in token auth (`_wrapAuth`), and handles bulk ops, chunked JSON
   streaming of large arrays, CAS, upsert, commit logging, and hook dispatch. Subclasses
   mostly override `getManager`, `getType`, `convertToResponseObject`, and `applyDefaults`.

2. **Managers** (`util/*-manager.js`) - domain/DB layer, all subclass
   **`util/manager.js`** (`Manager`). A Manager owns a Mongoose model and implements
   validation, `applyUpdate`, RBAC authorization, references/joins, and the actual
   add/update/delete/getAll operations. Controllers delegate here; managers do not know
   about HTTP.

3. **Mongoose models** - built from SIS schema definitions, not hand-written per type.

### The schema/entity engine (the non-obvious core)

`util/schema-manager.js` is central and is created once in `server.js` after the Mongo
connection opens. On boot it calls `bootstrapEntitySchemas` to register SIS's own
internal schemas (users, tokens, hooks, hiera, schemas themselves - see
`util/sis-schemas.js`). At runtime, when a request hits `/api/v1.1/entities/:schema`,
`EntityController.getManager` asks `schemaManager.getEntityManager(name)`, which looks up
the user-defined schema document and **dynamically builds a Mongoose model and an
`entity-manager` for it on the fly**. So "tables" in SIS are data, created via the
`/schemas` API, not code. `schema-manager.js` also monkeypatches Mongoose `Document.init`/
`toObject` to tolerate schema changes (e.g. a field changing type) without crashing.

SIS internal metadata lives in the `_sis` subdocument on every object (`owner`, `locked`,
`immutable`, `tags`, `_created_by/_at`, `_updated_by/_at`); `_sis_references`,
`_sis_arraypaths`, `_sis_defaultpaths` are attached to schemas to drive joins, array
normalization, and populate behavior. See `docs/index.md` for the full field/endpoint model.

### Cross-cutting pieces

- **Auth**: Passport strategies in `routes/webutil.js` - a user/password strategy (to mint
  tokens via `Authorization`) and a token strategy (`x-auth-token`). Backends are `sis`
  (passwords stored in SIS) or `ldap` (Active Directory), selected by `app.auth_config`.
  RBAC is enforced in the managers; reads are open by design.
- **Versioning**: paths carry `:version` (`v1` deprecated, `v1.1` current, see
  `SIS.SUPPORTED_VERSIONS`).
- **Commits / history**: `util/commit-manager.js` records diffs (via `jsondiffpatch`) when a
  controller is configured with `log_commits`; exposes `/<resource>/:id/commits` and
  point-in-time `/revision/:utc`.
- **Hooks**: `util/hook-manager.js` fires outbound webhooks on create/update/delete when a
  controller is configured with `fire_hooks`.
- **Constants**: `util/constants.js` holds every option key, error factory (`SIS.ERR_*`),
  field name, and enum used across layers - read it before inventing strings.
- **Clustering**: when `app.use_cluster` is set, `server.js` forks a worker per CPU.

### Configuration

Config is resolved by `nconf` in `server.js` in this precedence: env vars (nested key
separator is `__`) → argv → `conf/config.json.local` → `conf/config.json`. (`config.js`
at the repo root is a standalone template, not loaded by the server.) Tests load
`test/fixtures/config.test.json`. The config shape (`db`, `server`, `app`, `logger`) is
documented in `README.md`.

### Admin tooling

`tools/useradmin.js` creates/updates/deletes users from the command line (needed to
bootstrap the first superuser, since the REST API requires an existing privileged user):
`node tools/useradmin.js update|delete /path/to/user.json`.

## Conventions

- Promises are **native** (`Promise`). The small `util/promises.js` helper provides the
  idioms the code still leans on: `defer()` (replaces the old `BPromise.pending()`),
  `nodeify(promise, cb)`, `spread(fn)` (use `.then(P.spread(fn))`), and `tap(fn)`
  (`.then(P.tap(fn))`). When a promise chain needs `this`, capture `var self = this;`
  and reference `self` inside callbacks (there is no bluebird `.bind(this)` anymore);
  bare method references passed to `.then` must be `.bind(self)`.
- Mongoose 8 notes that bit during the upgrade and are worth remembering: query/model
  methods return promises (no callbacks); `ObjectId` instance strings are `"ObjectId"`;
  `strictQuery` is set to `false` (see `schema-manager.js`) so non-schema query paths
  (e.g. custom-type subpaths, join paths) are not stripped; `doc.set(obj, undefined,
  { merge: true })` is used so nested updates deep-merge; empty arrays satisfy
  `required`, so owner arrays use an explicit non-empty validator (`util/sis-schemas.js`).
- Express 5 notes: `req.query` is a re-parsing getter, so `server.js` snapshots it into a
  mutable own-property; the query parser is forced to `extended`; routes can't use inline
  regex or optional `:id?` (the `:version` param is validated via `app.param`).
- `lodash` v4 and `async` v3 are the utility libs; keep `"use strict"` at the top of each
  module and match the surrounding ES5-style code.
- API docs live in `docs/*.md`; `samples/` holds example schema/entity/hook JSON payloads.
