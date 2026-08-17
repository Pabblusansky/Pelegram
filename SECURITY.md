# Security Policy

## Supported versions

Pelegram is a personal hobby project. Security fixes land on the `master` branch
only; there are no maintained release branches.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately through GitHub's
[private vulnerability reporting](https://github.com/Pabblusansky/Pelegram/security/advisories/new)
form. If that is unavailable, open a regular issue that says only "security
report, please contact me" with no technical detail, and wait to be contacted.

Please include, where possible:

- What the issue is and roughly how severe you think it is
- Steps to reproduce, or a proof of concept
- Affected files, endpoints, or commit
- Any suggested fix

This is a spare-time project, so expect a first response within about a week.

## Scope

In scope:

- The Angular client in `client/`
- The Express/Socket.IO API in `server/`
- Authentication, authorisation, and data-exposure issues
- The deployed demo at `pelegram.netlify.app` and its API

Out of scope:

- Vulnerabilities in third-party hosting (Netlify, Render, MongoDB Atlas,
  Cloudinary) — report those to the vendor
- Denial of service through sheer traffic volume against the free-tier demo
- Missing hardening headers with no demonstrable impact
- Findings from automated scanners with no working proof of concept

## Please do not

- Access, modify, or delete other users' accounts, messages, or uploads. The
  demo has real accounts on it — use two accounts you created yourself.
- Run automated scanners or load tests against the deployed demo.
- Publicly disclose an unfixed issue.

## Deploying your own instance

If you self-host Pelegram, note that:

- `SECRET_KEY` must be a long random value, unique per deployment. The server
  validates its length at startup and refuses to run without it.
- Rotating `SECRET_KEY` invalidates all existing access tokens, which is the
  intended way to force every session to re-authenticate.
- Never commit `.env`. Use `server/.env.example` as the template.
