# Troubleshooting

- `OAuth ... failed (HTTP 401)`. Wrong client id or secret, the grant isn't enabled, or no application user is set for `client_credentials`.
- `NO_SCOPE`. The app scope doesn't exist on the instance.
- `PRODUCTION`. The instance reports itself as production. kiwistack will not use it.
- `Could not resolve the current user`. The acting user can't read `sys_user`, or the instance blocks `javascript:` in queries. Give the user `sys_user` read access.

Tokens are cached in `~/.kiwistack/tokens.json`. Delete that file to force a fresh login.
