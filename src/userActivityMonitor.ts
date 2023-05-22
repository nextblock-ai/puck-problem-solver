// userActivityMonitor.ts
import * as vscode from "vscode";

class UserActivityMonitor {
  private _timeoutId: NodeJS.Timeout | null = null;
  private _userIsIdle: boolean = false;
  private _inactiveTimeThreshold: number; // in milliseconds

  constructor(inactiveTimeThreshold: number = 5000) {
    this._inactiveTimeThreshold = inactiveTimeThreshold;
  }

  startMonitoring() {
    vscode.window.onDidChangeTextEditorSelection(this._onUserActivity, this);
  }

  isUserIdle(): boolean {
    return this._userIsIdle;
  }

  private _onUserActivity() {
    this._userIsIdle = false; // reset the idle state
    if (this._timeoutId) {
      clearTimeout(this._timeoutId); // clear the last timeout
    }

    // Create a new timeout to set the user as idle after the specified idle threshold
    this._timeoutId = setTimeout(() => {
      this._userIsIdle = true;
    }, this._inactiveTimeThreshold);
  }
}

export const userActivityMonitor = new UserActivityMonitor(); // Singleton instance