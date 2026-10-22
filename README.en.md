# Songguo Workspace V0.1 personal noncommercial trial source preview

Organize projects, source material, named Agents, work submissions, revisions, acceptance and explicit project closeout in a private workspace. Includes a read-only Workline board and six management-method guides.

**Original code is for personal noncommercial trial only; no commercial-use license is granted.** This is a restricted-source preview, not a general open-source license. There is no public running product service and no production-READY claim. See [LICENSE](LICENSE), [NOTICE](NOTICE.md), [full third-party texts](third-party/README.md), [license status](LICENSE-STATUS.md) and [Chinese instructions](README.md). Upstream rights remain independent.

## Version and acceptance boundaries

- `7f85eed66af205df9ed96579d8ad0c2f30f3c8e1`: historical isolated empty-install, HTTP/browser, ACL, repeat-install and restart-readback acceptance baseline. Those results are not current-package acceptance.
- `edc21795b1d7848770919d6a0a1a04c1294ce11d`: targeted static/export checks for context cleanup, unused CSS removal and a generic template description. Methods and Workline were preserved; runtime acceptance was not repeated.
- This package adds license/NOTICE texts, documentation and a release inventory on top of edc2179. Runtime code is unchanged from that code baseline. Exact source identity and file hashes are in `release-manifest.json`.

Current-package build, HTTP/browser, install and recovery acceptance are **NOT_RUN**. Source publication is not public-hosting, container-review or recovery clearance.

PostgreSQL is the sole structured fact store, NocoBase provides persistence and general data operations, and Next.js implements the workspace and tenant-authorized API. Registering an Agent does not connect or execute it. This product does not host AI inference, provide a full Gantt planner or knowledge answering, or include enterprise integrations. Accepting a task does not complete its project.

Linux, Node.js 22, Docker Engine, and Compose 2.24+ are required. Check free disk space before starting. From this candidate directory:

```sh
node tools/private-install.mjs init acceptance 23501 23500
node tools/private-install.mjs check acceptance
node tools/private-install.mjs install acceptance
```

Open `http://127.0.0.1:23501/workspace` and register fictional test users. `/demo` contains fictional interactive content. This recipe binds the web and backend to loopback, generates separate credentials, and exposes no database port. It supports isolated local HTTP acceptance; do not expose this recipe unchanged to the Internet.

The installer refuses key replacement, foreign mounts, concurrent runs, and unresolved provisioning compensation. It retains data on failure and never automatically deletes volumes. The web service receives only a restricted service credential, a session key, and a credential pepper, not database or administrator passwords.

```sh
npm ci --prefix web --ignore-scripts
npm run verify
node tools/verify-private-install.mjs seed acceptance
PLAYWRIGHT_BASE_URL=http://127.0.0.1:23501 NOCOBASE_URL=http://127.0.0.1:23500 node web/scripts/test-real-workspace-v1.mjs
PLAYWRIGHT_BASE_URL=http://127.0.0.1:23501 PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run --prefix web test:workspace-v1-browser
node tools/private-install.mjs install acceptance
node tools/verify-private-install.mjs readback acceptance
node tools/private-install.mjs restart acceptance
node tools/verify-private-install.mjs readback acceptance
```

Run `seed` only before the business tables contain data. These tests create fictional accounts and projects and must never target production. Set the browser executable to its actual local path. Original traces, screenshots, and logs can contain test passwords or invitations and must be reviewed before sharing.

`release-manifest.json` binds the package to a source version and file hashes. No old Git history, enterprise data, dependency implementation tree, native/WASM binary, browser or backend image is bundled. Versioned generic schema/migrations remain; installation needs no development-repository access.

The recipe obtains upstream software separately. Its original licenses, interface identification and other applicable conditions still apply. The included third-party texts are unmodified; the application's trial terms do not replace upstream grants. Distributing built binaries/images requires assessing the actual third-party bytes included in that distribution.

Public operation still needs NocoBase hosting/branding obligations, full recovery acceptance and verification on a specific HTTPS environment. The loopback local recipe must not be exposed unchanged to the Internet. Installation instructions are not evidence of a passed check.
