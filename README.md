# Linear VS Code authentication provider

[This extension](https://marketplace.visualstudio.com/items?itemName=linear.linear-connect) exposes an authentication provider to connect to the Linear API.

You won't usually install this extension by yourself, it'll most likely be installed by another extension as a dependency.

## How to use

If you're building a VS Code extension yourself and want to interact with the [Linear API](https://developers.linear.app) it's as easy as:

### Include the Linear Connect extension

Add the [linear-connect](https://marketplace.visualstudio.com/items?itemName=linear.linear-connect) extension to the `extensionDepedencies` inside your `package.json`.

```json
"extensionDependencies": [
  "linear.linear-connect"
],
```

### Get or create a Linear API session

With [linear-connect](https://marketplace.visualstudio.com/items?itemName=linear.linear-connect) as your dependecy, you can now request a Linear session from our VS Code authentication provider and use it with our [Linear SDK](https://developers.linear.app/docs/sdk/getting-started):

```typescript
import * as vscode from "vscode";
import { LinearClient } from "@linear/sdk";

const session = await vscode.authentication.getSession(
  "linear", // Linear VS Code authentication provider ID
  ["read"], // OAuth scopes we're requesting
  { createIfNone: true }
);

if (session) {
  const linearClient = new LinearClient({
    accessToken: session.accessToken,
  });

  console.log("Acquired a Linear API session", {
    account: session.account,
  });
} else {
  console.error(
    "Something went wrong, could not acquire a Linear API session."
  );
}
```

To see a demo of how to use it in practice, check out our simple [Open issue in Linear](https://github.com/linear/linear-vscode-open-issue) extension.

---

## Developing & Contributing

After cloning the repo, use `yarn` to install all the package dependencies.

In VS Code you change the code and run the extension in a separate app window to test with F5 (Run > Start Debugging).

### Publishing

To publish a new version of the extension, first install the [vsce](https://www.npmjs.com/package/vsce) package, that is used to build VS Code extension packages.

```bash
npm i -g vsce
```

Then make sure to:

1. Update the version in `package.json` according to semver
2. Add appropriate changes to `CHANGELOG.md`

Build the new extension package.

```bash
vsce package
```

This produces a new file `linear-connect-1.0.1.vsix`, if your version was set to 1.0.1 in `package.json`.

You can use this file to release a new version of the extension on the [VS Code marketplace](https://marketplace.visualstudio.com/manage/publishers/Linear).
