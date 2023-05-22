// autonomousMode.ts
import * as vscode from 'vscode';
import { fixSelectedProblem } from './fixSelectedProblem';
import { userActivityMonitor } from './userActivityMonitor';

let autonomousModeActive = false;

export function startStopAgents(): void {
  autonomousModeActive = !autonomousModeActive;

  if (autonomousModeActive) {
    vscode.window.showInformationMessage('Autonomous mode started.');
    userActivityMonitor.startMonitoring();
    runAutonomousMode();
  } else {
    vscode.window.showInformationMessage('Autonomous mode stopped.');
  }
}

async function runAutonomousMode(): Promise<void> {
  while (autonomousModeActive) {
    await delay(1000); // Wait for a while before checking user activity and problems again

    if (userActivityMonitor.isUserIdle()) {
      const diagnostics = vscode.languages.getDiagnostics();
      const hasProblems = diagnostics.some((diag) => diag[1].length > 0);

      if (hasProblems) {
        await fixSelectedProblem();
      } else {
        autonomousModeActive = false;
        vscode.window.showInformationMessage('All problems fixed. Autonomous mode stopped.');
      }
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}