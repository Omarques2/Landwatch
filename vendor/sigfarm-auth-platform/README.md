Vendored SDK artifacts from `sigfarm-auth-platform`.

Source repository:
`https://github.com/Omarques2/sigfarm-auth-platform`

Current artifacts:
- `dist-packages/sigfarm-auth-contracts-0.1.0.tgz`
- `dist-packages/sigfarm-auth-client-vue-0.1.0.tgz`
- `dist-packages/sigfarm-auth-guard-nest-0.1.0.tgz`
- `dist-packages/SHA256SUMS`

Update process:
1. Pull latest `sigfarm-auth-platform`.
2. Run `npm pack` for each SDK package.
3. Replace files in `dist-packages/`.
4. Recompute checksums and update `dist-packages/SHA256SUMS`.
5. Run `node vendor/sigfarm-auth-platform/verify-checksums.js`.
6. Run `npm install` in `apps/web` and `apps/api` to refresh lockfiles.
