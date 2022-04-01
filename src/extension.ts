import * as vscode from "vscode";
import { LinearAuthenticationProvider } from "./LinearAuthenticationProvider";

/**
 * Register the Linear API authentication provider.
 */

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(new LinearAuthenticationProvider(context));
}

export function deactivate() {}
