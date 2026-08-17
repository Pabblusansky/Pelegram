## What does this change?

<!-- A short description of the change and why it is needed. -->

Closes #

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor (no behaviour change)
- [ ] Documentation
- [ ] Build, CI, or tooling

## How was it tested?

<!-- What you actually ran or clicked through. -->

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm test` passes
- [ ] `npm run build` passes
- [ ] Tested manually in the browser

## Checklist

- [ ] Focused on a single concern
- [ ] Follows the conventions in [CONTRIBUTING.md](../CONTRIBUTING.md)
- [ ] No secrets, tokens, or `.env` files committed
- [ ] New server routes are registered **after** `app.use(authenticateToken)`, or are intentionally public
- [ ] Mongoose queries return only the fields the client needs
- [ ] Documentation updated if setup or behaviour changed

## Screenshots

<!-- For UI changes. Delete if not applicable. -->
