// workspaceConfiguration.ts
import * as vscode from 'vscode';
import { BUG_ZAPPER_JSON_FILENAME } from './constants';

interface ProblemSolverData {
  fixedFiles: string[];
  historicalFixes: { [file: string]: any[] };
}

export class WorkspaceConfiguration {
  private _configuration: vscode.WorkspaceConfiguration;

  constructor() {
    this._configuration = vscode.workspace.getConfiguration("puckProblemSolver");
  }

  saveProblemSolverData(data: ProblemSolverData): void {
    this._configuration.update(BUG_ZAPPER_JSON_FILENAME, data, vscode.ConfigurationTarget.Workspace);
  }

  loadProblemSolverData(): ProblemSolverData {
    const data = this._configuration.get<ProblemSolverData>(BUG_ZAPPER_JSON_FILENAME);
    return data ?? {
      fixedFiles: [],
      historicalFixes: {},
    };
  }
}