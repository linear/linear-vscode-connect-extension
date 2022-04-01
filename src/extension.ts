import * as vscode from "vscode";
import { LinearAuthenticationProvider } from "./LinearAuthenticationProvider";

/**
 * Register the Linear API authentication provider.
 */

export async function activate(context: vscode.ExtensionContext) {
  // Register the Linear authentication provider.
  const linearAuthProvider = new LinearAuthenticationProvider(context);
  context.subscriptions.push(linearAuthProvider);

  // Register the logout command.
  const logoutCommand = vscode.commands.registerCommand(
    "linear-connect.logout",
    async () => {
      const sessions = await linearAuthProvider.getSessions();
      for (const session of sessions) {
        await linearAuthProvider.removeSession(session.id);
      }

      vscode.window.showInformationMessage(
        `Logged out of all Linear API sessions.`
      );
    }
  );
  context.subscriptions.push(logoutCommand);

  // Monitor Linear sessions to show/hide the logout command.
  linearAuthProvider.onDidChangeSessions(() => {
    checkForSessions(linearAuthProvider);
  });
  checkForSessions(linearAuthProvider);
}

export function deactivate() {}

async function checkForSessions(
  linearAuthProvider: LinearAuthenticationProvider
) {
  const existingSessions = await linearAuthProvider.getSessions();

  // Set a context variable based on whether we have existing Linear sessions or not.
  vscode.commands.executeCommand(
    "setContext",
    "linear-connect.hasLinearSessions",
    existingSessions.length > 0
  );
}
