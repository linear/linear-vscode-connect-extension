# Linear VS Code connect extension

This extension exposes an authentication provider to connect to the Linear API.

You won't usually install this extension by yourself, it'll most likely be installed by another extension as a dependency.

## How to use

If you're building a VS Code extension yourself and want to interact with the [Linear API](https://developers.linear.app) it's as easy as:

### Include the Linear Connect extension

Add the [linear-connect]() extension to the `extensionDepedencies` inside your `package.json`.

```json
"extensionDependencies": [
  "linear.linear-connect"
],
```

### Get or create a Linear API session

Request a Linear session from our VS Code authentication provider

```typescript
import * as vscode from "vscode";
import { LinearClient } from "@linear/sdk";

const LINEAR_AUTHENTICATION_PROVIDER_ID = "linear";
const LINEAR_AUTHENTICATION_SCOPES = ["read"];

const session = await vscode.authentication.getSession(
  LINEAR_AUTHENTICATION_PROVIDER_ID,
  LINEAR_AUTHENTICATION_SCOPES,
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
