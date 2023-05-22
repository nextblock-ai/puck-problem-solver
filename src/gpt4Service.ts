import * as vscode from "vscode";
import ProblemSolverSPS from "./utils/sps/bugzapper";
import { getExtensionContext } from "./extension";

/* eslint-disable @typescript-eslint/naming-convention */
interface GPT4RequestPayload {
  language: "typescript";
  problem: vscode.Diagnostic;
  code: string;
  file: string;
  callback: (newCode: string, diffPatch: string) => void;
}

// class is responsible for managing GPT-4 fix requests. It ensures that duplicate requests are not sent to GPT-4
// and also enables a means to cancel a request if it is taking too long. The class will also return alist of
// suggested fixes from GPT-4.
class GPT4FixManager {
  
}

// request a fix from GPT-4
export async function requestGPT4Fix(payload: GPT4RequestPayload): Promise<void> {

  const extensionContext = getExtensionContext();

  const zapper = new ProblemSolverSPS(extensionContext, '');
  const data = await zapper.handleUserRequest(payload.file, zapper.semanticActions);

  if (data.newCode || data.diffPatch) {
    payload.callback(data.newCode, data.diffPatch);
  } else {
    throw new Error("No fix received from GPT-4.");
  }
}