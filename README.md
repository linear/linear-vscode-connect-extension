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

if (!session) {
  vscode.window.showErrorMessage(
    `We weren't able to log you into Linear when trying to open the issue.`
  );
  return;
}

const linearClient = new LinearClient({
  accessToken: session.accessToken,
});

console.log("Acquired a Linear API session", {
  account: session.account,
});
```

For a finished extension using `linear-connect` to authenticate you can check out our own "Open issue in Linear" extension.
