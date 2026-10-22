# Third-party notices — source-only distribution

Original application code uses the [Songguo Personal Trial License](LICENSE).
Third-party copyrights, permissions and required notices remain independent;
that license does not restrict rights granted by the upstream licenses below.
Unmodified full texts and their hashes are in [third-party/](third-party/README.md)
and [catalog.json](third-party/catalog.json).

| Referenced dependency | Version | Upstream license / preserved texts |
| --- | --- | --- |
| Next.js | 15.5.27 | [MIT](third-party/licenses/next.txt), including the generated declaration reference |
| React / React DOM | 19.1.0 | [MIT](third-party/licenses/react.txt) |
| @playwright/test | 1.63.0 | [Apache 2.0](third-party/licenses/playwright-license.txt), [NOTICE](third-party/licenses/playwright-notice.txt) |
| @types/node | 22.15.30 | [MIT](third-party/licenses/definitelytyped.txt) |
| @types/react | 19.1.4 | [MIT](third-party/licenses/definitelytyped.txt) |
| @types/react-dom | 19.1.5 | [MIT](third-party/licenses/definitelytyped.txt) |
| TypeScript | 5.8.3 | [Apache 2.0](third-party/licenses/typescript-license.txt), [ThirdPartyNotices](third-party/licenses/typescript-third-party-notices.txt) |

The lockfile identifies separately fetched dependencies and optional native
variants. This repository does **not** distribute node_modules, their implementation
code, native/WASM binaries, browsers or container images. Full upstream attribution
texts are provided here without suggesting those binaries are bundled. Any future
binary/image distribution needs notices and other obligations for its actual
contents; this source package is not such a distribution.

The local installation recipe separately obtains Node.js 22.14.0, PostgreSQL
16.4-alpine and NocoBase 2.0.60-full. Their upstream terms continue to apply:
[Node.js license](https://github.com/nodejs/node/blob/v22.14.0/LICENSE),
[PostgreSQL license](https://www.postgresql.org/about/licence/),
[NocoBase v2.0.60 agreement](https://github.com/nocobase/nocobase/blob/v2.0.60/LICENSE.txt).
NocoBase's root agreement incorporates Apache 2.0 and supplementary terms;
package-level Apache texts alone do not settle installation or public-service
obligations. No public hosting permission is asserted. See
[LICENSE-STATUS.md](LICENSE-STATUS.md).
