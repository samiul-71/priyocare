<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project rules (priyocare)

These rules are mandatory for any agent working in this repository.

## Framework
- Follow the **latest Next.js (currently v16.2.10) and React** guidelines for every change. This is not the Next.js in your training data — read the relevant guide in `node_modules/next/dist/docs/` before writing code, and heed deprecation notices.

## Documentation
- After building or completing any task, update the relevant docs (`README.md`, in-repo docs, etc.) to reflect the change.

## Git & commits
- **Never push to the `main` branch** on GitHub. Work on `development` or feature branches.
- **Never mention Claude / AI** in commit messages (no `Co-Authored-By: Claude`, no AI attribution).
- **Never commit without explicit permission** from the user.
