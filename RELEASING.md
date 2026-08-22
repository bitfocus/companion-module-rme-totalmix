# Releasing

This module follows the standard Bitfocus Companion module release workflow.

## First Bitfocus release

1. Ask for `companion-module-rme-totalmix` in the Bitfocus Slack `#module-development` channel and include the maintainer GitHub username.
2. Add the new Bitfocus repository as a Git remote and push the `main` branch.
3. Set the release version in `package.json`. Keep `version` and `runtime.apiVersion` in `companion/manifest.json` at `0.0.0`; the module build replaces both values.
4. Run the checks below and create a matching `vX.Y.Z` Git tag.
5. Push the tag and submit it through the Companion Developer Portal under **My Connections > Submit Version**.

## Release checks

```sh
corepack yarn install
corepack yarn build
corepack yarn lint
corepack yarn test
corepack yarn package
```

The package version and Git tag must match. The generated archive must contain the compiled module, `HELP.md`, `LICENSE`, and the build-generated manifest metadata.
