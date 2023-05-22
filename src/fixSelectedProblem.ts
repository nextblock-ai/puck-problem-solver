// fixSelectedProblem.ts
import * as vscode from 'vscode';
import { SUPPORTED_EXTENSIONS, COMMANDS } from './constants';
import { applyDiffPatch } from './utility';
import { WorkspaceConfiguration } from './workspaceConfiguration';
import { requestGPT4Fix } from './gpt4Service';

function applyFix(workspaceConfiguration: any, editor: any, currentData: any, newCode: string, diffPatch: string) {
  const document = editor.document;
  const filepath = document.fileName;
  if (newCode) {
    editor.edit((editBuilder: any) => {
      const range = new vscode.Range(new vscode.Position(0, 0), document.lineAt(document.lineCount - 1).range.end);
      editBuilder.replace(range, newCode);
    });
    currentData.fixedFiles.push(filepath);
    currentData.historicalFixes[filepath] = currentData.historicalFixes[filepath] || [];
    currentData.historicalFixes[filepath].push({ timestamp: new Date(), newCode });
  } else if (diffPatch) {
    const updatedCode = applyDiffPatch(document.getText(), diffPatch);
    editor.edit((editBuilder: any) => {
      const range = new vscode.Range(new vscode.Position(0, 0), document.lineAt(document.lineCount - 1).range.end);
      editBuilder.replace(range, updatedCode);
    });

    currentData.fixedFiles.push(filepath);
    currentData.historicalFixes[filepath] = currentData.historicalFixes[filepath] || [];
    currentData.historicalFixes[filepath].push({ timestamp: new Date(), diffPatch });
  }
  workspaceConfiguration.saveProblemSolverData(currentData);
}

export async function fixSelectedProblem(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active editor found to fix the problem.');
    return;
  }

  const document = editor.document;
  const filepath = document.fileName;

  if (!SUPPORTED_EXTENSIONS.some((ext) => filepath.endsWith(ext))) {
    vscode.window.showWarningMessage('The active file type is not supported.');
    return;
  }

  const diagnostics = vscode.languages.getDiagnostics(document.uri);
  if (!diagnostics.length) {
    vscode.window.showInformationMessage('No problems found in the active file.');
    return;
  }

  const workspaceConfiguration = new WorkspaceConfiguration();
  const currentData = workspaceConfiguration.loadProblemSolverData();

  const problem = diagnostics[0]; // Assume the first diagnostic is the selected problem

  try {
    await requestGPT4Fix({
      language: 'typescript',
      problem,
      file: filepath,
      code: document.getText(),
      callback: (newCode: string, diffPatch: string) => {
        applyFix(workspaceConfiguration, editor, currentData, newCode, diffPatch);
      }
    });
  } catch (error: any) {
    vscode.window.showErrorMessage(`Failed to fix the problem: ${error.message}`);
  }
}