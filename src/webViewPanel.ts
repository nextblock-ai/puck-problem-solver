// webviewPanel.ts
import * as vscode from "vscode";

class ProblemSolverPanel {
  private panel: vscode.WebviewPanel;

  constructor() {
    this.panel = vscode.window.createWebviewPanel(
      "puck.problemSolver.problemSolverPanel",
      "Bug Zapper",
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    this.panel.webview.html = `
    <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${this.panel.webview.cspSource} https:; script-src ${this.panel.webview.cspSource}; style-src ${this.panel.webview.cspSource};">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Your Custom View</title>
      </head>
      <body>
          <h1>Hello from Your Custom View!</h1>
      </body>
      </html>
    `;
  }

  reveal() {
    this.panel.reveal();
  }

  update(content: string) {
    this.panel.webview.html = content;
  }

  onDidDispose(callback: () => void) {
    this.panel.onDidDispose(callback, null, []);
  }
}

// Singleton instance
let problemSolverPanel: ProblemSolverPanel | undefined;

export function revealProblemSolverPanel(): ProblemSolverPanel {
  if (!problemSolverPanel) {
    problemSolverPanel = new ProblemSolverPanel();
  }

  problemSolverPanel.reveal();
  return problemSolverPanel;
}