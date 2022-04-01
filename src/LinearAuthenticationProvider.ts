import * as vscode from "vscode";
import fetch from "node-fetch";
import { v4 as uuid } from "uuid";
import { LinearClient } from "@linear/sdk";
import assert = require("assert");

/**
 * Linear OAuth details
 * @see https://developers.linear.app/docs/oauth/authentication
 */
const OAUTH_CLIENT_ID = "55d657b37f9a89be526a866191e89322";
const OAUTH_CLIENT_SECRET = "2ae7d669277c0a89e9531db95347b38e"; // Not really that secret, eh? @see https://www.oauth.com/oauth2-servers/single-page-apps/
const OAUTH_AUTHORIZE_URL = "https://linear.app/oauth/authorize";
const OAUTH_TOKEN_URL = "https://api.linear.app/oauth/token";
const OAUTH_REDIRECT_URL = `${vscode.env.uriScheme}://linear.linear-connect/callback`;

// Extension secrets storage key.
const SECRET_STORAGE_KEY = "linear.auth";

interface ILinearSessionStorage {
  [k: string]: vscode.AuthenticationSession;
}

export class LinearAuthenticationProvider
  implements vscode.AuthenticationProvider, vscode.Disposable
{
  constructor(private readonly context: vscode.ExtensionContext) {
    // Read the current state of stored sessions.
    this.sessionsPromise = this.getSessions();

    this.disposable = vscode.Disposable.from(
      // Register URI handler for OAuth callback
      vscode.window.registerUriHandler(this.uriEventHandler),
      // Register the auth provider
      vscode.authentication.registerAuthenticationProvider(
        "linear",
        "Linear",
        this,
        { supportsMultipleAccounts: false }
      ),
      this.context.secrets.onDidChange(() => this.checkForUpdates())
    );
  }

  public dispose() {
    console.debug("Linear disposed");
    this.disposable.dispose();
  }

  public get onDidChangeSessions() {
    return this.sessionChangeEmitter.event;
  }

  public async getSessions(
    scopes?: string[]
  ): Promise<vscode.AuthenticationSession[]> {
    const existingSessions = await this.existingSessions();
    return Object.values(existingSessions);
  }

  public async createSession(
    scopes: string[]
  ): Promise<vscode.AuthenticationSession> {
    const existingSession = await this.retrieveSession(scopes);
    if (existingSession) {
      console.debug(
        `Found existing session for scopes ${scopes}`,
        existingSession
      );
      return existingSession;
    }

    const token = await this.login();
    if (!token) {
      vscode.window.showErrorMessage(
        "There was a problem trying to authenticate with Linear!"
      );

      throw new LinearAuthenticationProviderError(
        "Token missing or not received from Linear API"
      );
    }

    this.info("Successfully authenticated with Linear!");

    const linearClient = new LinearClient({
      accessToken: token,
    });

    // Fetch current user details.
    const userInfo = await linearClient.viewer;

    // Create a new Linear session.
    const session: vscode.AuthenticationSession = {
      id: uuid(),
      accessToken: token,
      account: {
        label: `${userInfo.name} (${userInfo.email})`,
        id: userInfo.id,
      },
      scopes,
    };

    // Store the session.
    await this.storeSession(scopes, session);

    // Emit event.
    this.sessionChangeEmitter.fire({
      added: [session],
      removed: [],
      changed: [],
    });

    return session;
  }

  public async removeSession(sessionId: string): Promise<void> {
    console.debug(`Logging out Linear session ${sessionId}`);

    try {
      const sessions = await this.existingSessions();
      for (const session in sessions) {
        if (sessions[session].id !== sessionId) {
          continue;
        }

        const loggedOutSession = { ...sessions[session] };
        delete sessions[session];
        await this.storeSessions(sessions);

        this.sessionChangeEmitter.fire({
          added: [],
          removed: [loggedOutSession],
          changed: [],
        });

        return Promise.resolve();
      }

      throw new LinearAuthenticationProviderError(
        `Session ${sessionId} not found`
      );
    } catch (error) {
      this.error(`Log out of Linear failed: ${error}`, {
        userPresentableMessage: "Logging out of Linear failed",
      });

      return Promise.reject(error);
    }
  }

  // -- Private interface

  private async login(): Promise<string> {
    const state = uuid();

    const searchParams = new URLSearchParams([
      ["client_id", OAUTH_CLIENT_ID],
      ["redirect_uri", OAUTH_REDIRECT_URL],
      ["response_type", "code"],
      ["scope", "read"],
      ["state", state],
    ]);

    const authorizeUri = vscode.Uri.parse(
      `${OAUTH_AUTHORIZE_URL}?${searchParams.toString()}`
    );

    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Window,
        title: "Signing in to Linear ...",
      },
      async () => {
        // Open the OAuth authorize page in the default browser.
        await vscode.env.openExternal(authorizeUri);

        let subscription: vscode.Disposable;
        let cancelCodeExchangeEvent = new vscode.EventEmitter<void>();

        // Create a promise that resolves when we've exchanged the OAuth code for the access token.
        // The process is invoked by the uriEventHandler which listens to calls to the extension URL.
        const codeExchangePromise = new Promise<string>(
          async (resolve, reject) => {
            subscription = this.uriEventHandler.event((uri: vscode.Uri) => {
              this.exchangeCodeForToken(state, uri, resolve, reject);
            });

            cancelCodeExchangeEvent.event(() => reject("Cancelled"));
          }
        );

        // Wait for the callback to be called from clicking the Authorize link in Linear in the browser window that was opened.
        // Or cancel the whole thing in 60 seconds.
        return Promise.race([
          codeExchangePromise,
          new Promise<string>((_, reject) =>
            setTimeout(() => reject("Cancelled"), 60000)
          ),
        ]).finally(() => {
          subscription.dispose();
          cancelCodeExchangeEvent.fire();
          cancelCodeExchangeEvent.dispose();
        });
      }
    );
  }

  private async exchangeCodeForToken(
    state: string,
    uri: vscode.Uri,
    resolve: (value: string | PromiseLike<string>) => void,
    reject: (reason: any) => void
  ) {
    const query = new URLSearchParams(uri.query);
    const code = query.get("code");
    const callbackState = query.get("state");

    if (!code) {
      throw new LinearAuthenticationProviderError("No code");
    }

    if (state !== callbackState) {
      throw new LinearAuthenticationProviderError(
        `State doesn't match (${state},${callbackState})`
      );
    }

    console.debug("Exchanging code for token");

    try {
      const body = new URLSearchParams({
        code,
        redirect_uri: OAUTH_REDIRECT_URL,
        client_id: OAUTH_CLIENT_ID,
        client_secret: OAUTH_CLIENT_SECRET,
        grant_type: "authorization_code",
      });

      const result = await fetch(OAUTH_TOKEN_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });

      if (result.ok) {
        const json: any = await result.json();
        console.debug("Token exchange success!", json);
        resolve(json.access_token);
      } else {
        reject(result.statusText);
      }
    } catch (ex) {
      reject(ex);
    }
  }

  private async checkForUpdates() {
    const previousSessions = await this.sessionsPromise;
    this.sessionsPromise = this.getSessions();
    const storedSessions = await this.sessionsPromise;

    const added: vscode.AuthenticationSession[] = [];
    const removed: vscode.AuthenticationSession[] = [];

    for (const storedSession of storedSessions) {
      // A session was added in another window
      if (!previousSessions.find((s) => s.id === storedSession.id)) {
        console.debug("Adding a new session found in secret storage");
        added.push(storedSession);
      }
    }

    for (const previousSession of previousSessions) {
      // Got logged out in another window
      if (!storedSessions.find((s) => s.id === previousSession.id)) {
        console.debug("Removing session no longer found in secret storage");
        removed.push(previousSession);
      }
    }

    if (added.length || removed.length) {
      this.sessionChangeEmitter.fire({ added, removed, changed: [] });
    }
  }
  // -- Secret management

  private async existingSessions(): Promise<ILinearSessionStorage> {
    let existingSessions: ILinearSessionStorage = {};
    const existingSessionsData = await this.context.secrets.get(
      SECRET_STORAGE_KEY
    );

    if (existingSessionsData) {
      try {
        existingSessions = JSON.parse(existingSessionsData);

        // Validate data.
        for (const session in existingSessions) {
          assert(existingSessions[session]);
          assert(existingSessions[session]?.accessToken);
          assert(existingSessions[session]?.id);
          assert(existingSessions[session]?.account?.id);
          assert(existingSessions[session]?.account?.label);
        }
      } catch (error) {
        console.error("Could not load valid data from secrets store", error);

        // Clear the secrets storage since we have corrupted data.
        await this.context.secrets.delete(SECRET_STORAGE_KEY);
        existingSessions = {};
      }
    }

    return existingSessions;
  }

  private async storeSessions(
    sessions: ILinearSessionStorage
  ): Promise<ILinearSessionStorage> {
    // Set the new sessions to the promise that is read when we're diffing in `checkForUpdates()`.
    this.sessionsPromise = Promise.resolve(Object.values(sessions));

    // Store it into secrets.
    await this.context.secrets.store(
      SECRET_STORAGE_KEY,
      JSON.stringify(sessions)
    );

    return sessions;
  }

  private async storeSession(
    scopes: string[],
    session: vscode.AuthenticationSession
  ): Promise<ILinearSessionStorage> {
    const existingSessions = await this.existingSessions();

    // Override or add the current session to the sessions storage object.
    existingSessions[this.scopesString(scopes)] = session;

    return this.storeSessions(existingSessions);
  }

  private async retrieveSession(
    scopes: string[]
  ): Promise<vscode.AuthenticationSession | undefined> {
    const sessions = await this.existingSessions();
    if (!sessions) {
      return;
    }

    return sessions[this.scopesString(scopes)];
  }

  private scopesString(scopes: string[]): string {
    return scopes.sort().join(",");
  }

  // -- Logging interface

  private info(
    message: string,
    options?: {
      userPresentableMessage?: string;
      metadata?: {};
    }
  ) {
    console.log(message, options?.metadata);
    vscode.window.showInformationMessage(
      options?.userPresentableMessage || message
    );
  }

  private error(
    message: string,
    options?: {
      error?: Error;
      userPresentableMessage?: string;
      metadata?: {};
    }
  ) {
    console.error(message, options?.metadata, options?.error);
    vscode.window.showErrorMessage(options?.userPresentableMessage || message);
  }

  // -- Properties

  private sessionChangeEmitter =
    new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
  private disposable: vscode.Disposable;
  private sessionsPromise: Promise<vscode.AuthenticationSession[]>;
  private uriEventHandler = new UriEventHandler();
}

class UriEventHandler
  extends vscode.EventEmitter<vscode.Uri>
  implements vscode.UriHandler
{
  constructor() {
    super();
  }

  public handleUri(uri: vscode.Uri) {
    console.debug("Handling URI...", uri);
    this.fire(uri);
  }
}

export class LinearAuthenticationProviderError extends Error {}
