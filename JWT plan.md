# Plan: convert temporary session tokens to JWT

## Scope

"Sessions" in SIS are the temporary tokens minted by
`POST /api/v1.1/users/auth_token`. This plan replaces them with signed JWTs.
Persistent API tokens (`POST /users/:uname/tokens`) stay opaque and DB-backed.

## How it works today

- `POST /api/v1.1/users/auth_token` (Basic auth, `sis` or `ldap` backend) calls
  `UserManager.createTempToken` (`util/user-manager.js:20`), which writes a
  `sis_tokens` doc with `expires = now + 8h`. A Mongo TTL index removes it later.
- Every authenticated request goes through `_verifySisToken`
  (`routes/webutil.js:87`): one DB read for the token, one for the user, then an
  `expires` check.
- Persistent tokens share the same collection and the same `x-auth-token` header.
  Super users can only have temporary tokens (`util/token-manager.js:774`).
- Deleting a user deletes their tokens (`util/user-manager.js:163`). Roles are read
  fresh from the user doc on every request.

## Key decisions

1. **Only temporary tokens become JWTs.** Persistent tokens are long-lived service
   credentials that need individual revocation, which JWTs handle poorly.
2. **Session length stays the same.** The default TTL remains 8 hours
   (`SIS.AUTH_EXPIRATION_TIME`). It becomes configurable via `app.jwt.ttl_ms`, but
   the default does not change and there is no refresh endpoint.
3. **The API contract stays the same.** `auth_token` still returns
   `{ name, username, expires }`; `name` is now the JWT. Existing clients that send
   `name` in `x-auth-token` keep working unchanged. JWTs contain dots and opaque
   tokens are 32 hex chars, so the two are unambiguous.
4. **`Authorization: Bearer <token>` is accepted** in addition to `x-auth-token`,
   for both JWTs and persistent tokens. (Details below.)
5. **Signing uses EdDSA (Ed25519) key pairs with a `kid` header.** Verify-only nodes
   (e.g. `readonly` replicas) need only the public key and cannot mint tokens. `kid`
   allows key rotation without logging everyone out.
6. **Keys are stored alongside the configuration** in `conf/keys/`, as PEM files
   referenced from `conf/config.json`. (Details below.)
7. **The JWT carries identity only, never roles.** The user is still loaded on each
   request, so role changes and user deletion take effect immediately, as they do
   today. The win is one less DB read per request, no session writes, and a
   standard token format.
8. **Logout uses a per-user session counter instead of a denylist.** A
   `session_gen` integer on `sis_users` is embedded in the JWT as the `sgen` claim and
   compared against the already-loaded user doc, so it adds no query. Logout or a
   password change increments it, ending all of that user's sessions.
9. **Library: `jose`.** Maintained, no dependencies, strict algorithm handling. It is
   ESM-only, so load it with dynamic `import()` the same way `ldapts` is loaded in
   `routes/webutil.js:66`.

## Token format

- Header: `alg: EdDSA`, `kid`, `typ: JWT`
- Claims: `iss` (configurable, default `"sis"`), `aud` (`"sis-api"`), `sub`
  (username), `iat`, `exp` (iat + TTL, default 8h), `jti` (random, for logging),
  `sgen`
- Verification: allow only `EdDSA` (rejects `none`, HS256, and algorithm-confusion
  attacks); require `exp`, `iss`, `aud`, `sub`; 30s clock tolerance. Error messages
  match today's ("Token has expired.", "Invalid token."), with the same 401 behavior.

## Key storage (alongside the configuration)

- Layout:
  ```
  conf/
    config.json
    config.json.local      (optional, git-ignored)
    keys/
      jwt-<kid>.key        (Ed25519 private key, PEM, mode 0600, git-ignored)
      jwt-<kid>.pub        (Ed25519 public key, PEM)
  ```
- Config block in `conf/config.json`:
  ```javascript
  "app" : {
      "jwt" : {
          // kid used to sign new tokens
          "active_kid" : "2026-11",
          // directory holding the key files, relative to conf/ unless absolute
          "keys_dir" : "keys",
          // session length in ms; defaults to 8 hours
          "ttl_ms" : 28800000,
          "issuer" : "sis"
      }
  }
  ```
- At startup the session module reads every `jwt-*.pub` in `keys_dir` as the
  verification key set (kid = the part of the filename after `jwt-`), and
  `jwt-<active_kid>.key` as the signing key. Rotation: drop in a new pair, switch
  `active_kid`, and delete the old `.pub` once the 8h window has passed.
- Relative paths resolve against the `conf/` directory, not the process cwd, so
  `npm start`, tests, and containers all find the same files.
- Every setting can be overridden through env vars (`app__jwt__active_kid`,
  `app__jwt__keys_dir`), matching the existing nconf precedence.
- `.gitignore`: ignore everything in `conf/keys/` except a `.gitkeep`, since key
  pairs are per deployment. `.dockerignore`: add `conf/keys/` so private keys are
  never baked into an image (the Dockerfile does `COPY . .`).
- `scripts/gen-jwt-key.js [--if-missing] [kid] [keys_dir]`: generates
  `conf/keys/jwt-<kid>.key` and `.pub` with mode 0600 on the private key, and never
  overwrites existing files (`--if-missing` exits 0 when the pair already exists).
  Add `npm run gen-jwt-key`.
- `server.js` `createSessionManager` loads the keys and fails fast with a clear
  message if `auth` is on and the active private key is missing or unreadable.
  Nodes in `readonly` mode only need the `.pub` files. `main()` runs this check
  (and `validateAppConfig`) before forking, so a bad config exits once with a
  log line instead of crashing every cluster worker in a re-fork loop.
- Containers: the image runs as `node` (uid 1000), which cannot read a host-owned
  0600 key in a bind mount. So the keys stay next to the config at
  `/app/conf/keys` but live in a named `sis_keys` volume. The Dockerfile creates
  that directory owned by `node`, and a one-shot `sis-keys` Compose service runs
  `gen-jwt-key --if-missing` before `sis-api` starts. Operators who manage keys on
  the host can still bind-mount them if the files are owned by uid 1000.
- Tests: commit a throwaway test key pair under `test/fixtures/keys/` and point
  `test/fixtures/config.test.json` at it.

## Authorization: Bearer support

- `SisTokenStrategy.authenticate` (`routes/webutil.js:139`) reads the token from
  `x-auth-token` first, then from `Authorization: Bearer <token>`. The scheme match
  is case-insensitive per RFC 6750.
- If both are present and they differ, reject with 400 rather than guessing.
- `Authorization: Basic` stays reserved for `POST /users/auth_token`. A Basic header
  on other routes is ignored by the token strategy, and the missing-token error
  message names both headers.
- On a 401 from token auth, send `WWW-Authenticate: Bearer realm="sis"` (add
  `error="invalid_token"` for bad or expired tokens).
- CORS (`server.js:42`) already allows `Authorization`; also expose
  `WWW-Authenticate` in `Access-Control-Expose-Headers`.
- Works for both JWT sessions and persistent tokens, since lookup branches on the
  token's shape after extraction.

## Implementation steps

**1. Config and keys**
- Constants in `util/constants.js`: `OPT_JWT`, `FIELD_SESSION_GEN`,
  `HEADER_AUTHORIZATION`, JWT defaults. `AUTH_EXPIRATION_TIME` (8h) remains the TTL
  default.
- Key loading, `gen-jwt-key` script, ignore files, compose mount, and
  `validateAppConfig` as described above.

**2. Session module (`util/session-manager.js`, new)**
- Loads the key set once at startup (works under `use_cluster`, since every worker
  reads the same files).
- `issue(user)` returns `{ name: jwt, username, expires: Date }`.
- `verify(token)` returns the claims or a `SIS.ERR_BAD_CREDS` error.
- Created in `server.js` next to the passport strategies and passed into
  `createTokenStrategy`.

**3. Issuing**
- Replace `UserManager.createTempToken` with `sessionManager.issue(user)`. Nothing
  is written to `sis_tokens`.
- `routes/users.js` `convertToResponseObject` keeps turning `expires` into ms
  remaining, so the response shape is unchanged.

**4. Verifying (`_verifySisToken`)**
- Extract the token (header logic above).
- JWT-shaped: verify, load the user by `sub`, check `sgen === user.session_gen`
  (missing = 0).
- Otherwise: the current opaque path. During rollout this accepts both persistent
  tokens and temporary tokens minted before the upgrade, so there is no data
  migration and no forced logout.

**5. Logout and invalidation**
- Add `session_gen: { type: "Number", default: 0 }` to `sis_users`
  (`util/sis-schemas.js`). Strip it from client input in `UserManager.add` /
  `applyUpdate`, the same way `pw` is handled, and hide it from responses.
- New `DELETE /api/v1.1/users/auth_token` (requires a token) increments the
  caller's `session_gen`. Register it before `ApiController.attach`, otherwise
  `DELETE /users/:id` captures it with `id=auth_token`.
- A password change in `applyUpdate` also increments `session_gen`.
- `objectRemoved` keeps deleting persistent tokens. JWTs for a deleted user already
  fail, because the user lookup 404s and maps to "Invalid token.".

**6. Token management cleanup**
- `TokenManager.authorize`: remove the temporary-token branches (`expires` checks,
  "Cannot create a temp token for another user") once `createTempToken` is gone.
  Keep the rule that super users cannot have persistent tokens.
- Temporary sessions no longer appear in `GET /users/:u/tokens` and cannot be
  deleted via `DELETE /users/:u/tokens/:name`. This is the one client-visible
  behavior change, so document it.

**7. Follow-up release (after the 8h window, ideally one version later)**
- Remove `expires` from the `sis_tokens` schema and explicitly drop the TTL index
  (Mongoose will not drop it on its own).
- Reject opaque tokens that still carry `expires`.

## Tests

- **Unit (`test/test-session-manager.js`):** sign and verify; expired; tampered
  payload; `alg: none`; HS256 signed with the public key; unknown `kid`; wrong
  `iss` / `aud`; rotation (old `kid` still verifies while its `.pub` is present);
  key loading from a relative `keys_dir`; missing private key fails startup
  validation.
- **API:**
  - `auth_token` returns a JWT with `expires` of about 8h, and it works for writes
    and, with `auth_reads`, for reads.
  - The same JWT works via `Authorization: Bearer`, including lowercase `bearer`.
  - A persistent token works via `Authorization: Bearer`.
  - Conflicting `x-auth-token` and Bearer values return 400.
  - A 401 includes `WWW-Authenticate: Bearer`.
  - An expired JWT returns 401.
  - Logout invalidates all of that user's sessions and nobody else's.
  - A password change invalidates sessions.
  - A deleted user's JWT is rejected.
  - A role change takes effect on the next request.
  - No `sis_tokens` doc is created on login.
  - A legacy opaque temporary token still works.
  - Persistent tokens are unchanged.
  - LDAP login issues a JWT.
- **Existing test updates:** the "delete tokens" block in
  `test/v1.1-api/test-api-tokens.js:155` deletes the temporary token through the
  tokens API. Change it to delete only persistent tokens and test logout
  separately. `test/fixtures/util.js` keeps using `.name`, so no change is needed
  there.
- **E2E:** start with no keys (clean failure, including cluster mode), generate
  keys, bring up the compose stack (with and without
  `compose.ldap.yaml`), then use `curl` to run login, a write with `x-auth-token`, a
  write with `Authorization: Bearer`, logout, and a write that now fails. Also
  confirm the startup error when `conf/keys` is empty, and confirm the built image
  contains no private key.
- `npm run lint` and `npm test` clean.

## Docs

- `docs/users.md`: Tokens section (temporary tokens are now JWTs, not listed,
  logout endpoint, Bearer header) and the token object description.
- `docs/index.md`: request headers paragraph (both `x-auth-token` and
  `Authorization: Bearer`).
- `README.md`: the `app.jwt` config block, the `conf/keys/` layout, key
  generation, the compose mount, and key rotation steps.

## Out of scope, noted

- Passwords are stored as unsalted SHA-256 (`util/user-manager.js:30`). Not part of
  this change, but it is the next weak point in this auth flow and should move to
  scrypt or argon2.
