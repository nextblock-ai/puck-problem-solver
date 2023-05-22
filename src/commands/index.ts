import * as vscode from "vscode";

import SetOpenAIKeyCommand from "./SetOpenAIKeyCommand";

export function activate(context: vscode.ExtensionContext) {

    new SetOpenAIKeyCommand("setOpenAIKey", "Set OpenAI Key", context);
}


export function deactivate() { }