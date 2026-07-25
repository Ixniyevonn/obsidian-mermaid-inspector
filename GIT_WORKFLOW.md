# Manual Git and release workflow

This project uses `main` and the `origin` remote at `Ixniyevonn/obsidian-mermaid-inspector`.
All project commands use Bun.

## Push an ordinary update

Run this from the repository root:

```sh
git status --short
git diff
bun run git:check
git add -A
git status --short
git diff --cached
git commit -m "Describe the change"
git push origin main
```

`bun run git:check` validates release metadata, runs every test, checks TypeScript
and Svelte, and creates the production build. Inspect the staged diff before the
commit so generated vault state or unrelated files are not included.

## Publish a BRAT update

The existing `0.1.0` tag is already used. Choose the next stable semantic version,
for example `0.1.1`.

1. Synchronize all version files:

   ```sh
   bun run release:prepare -- 0.1.1
   ```

   If the minimum supported Obsidian version changes, pass it as the second value:

   ```sh
   bun run release:prepare -- 0.2.0 1.5.0
   ```

2. Review and validate:

   ```sh
   git diff
   bun run git:check
   ```

3. Commit and push the release metadata with the code:

   ```sh
   git add -A
   git diff --cached
   git commit -m "Release 0.1.1"
   git push origin main
   ```

4. Tag that exact commit and push the tag:

   ```sh
   git tag 0.1.1
   git push origin 0.1.1
   ```

The tag must exactly match `manifest.json` without a `v` prefix. GitHub Actions
will run the same validation, create the GitHub Release, and attach `main.js`,
`manifest.json`, and `styles.css`. BRAT will then detect the new release.

## If something fails

- Do not tag a commit until `bun run git:check` succeeds.
- If a tag was created locally but not pushed, remove it with
  `git tag -d <version>`, fix the problem, and create it again.
- If the tag was already pushed, do not silently reuse it. Prepare a new patch
  version instead.
- Never commit files under `test-vault` except the project fixtures in
  `test-vault/Mermaid Inspector Tests`.