{
  "name": "puck-bug-zapper",
  "displayName": "puck-bug-zapper",
  "description": "Zap bugs with GPT-4",
  "version": "0.0.1",
  "engines": {
    "vscode": "^1.78.0"
  },
  "categories": [
    "Other"
  ],
  "activationEvents": [],
  "main": "./out/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "puck.problemSolver.fixNow",
        "title": "Fix Now"
      },
      {
        "command": "puck.problemSolver.startAgents",
        "title": "Start/Stop Agents"
      }
    ]
  },
  "scripts": {
    "vscode:prepublish": "npm run compile",
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./",
    "pretest": "npm run compile && npm run lint",
    "lint": "eslint src --ext ts",
    "test": "node ./out/test/runTest.js"
  },
  "devDependencies": {
    "@types/diff": "^5.0.3",
    "@types/glob": "^8.1.0",
    "@types/mocha": "^10.0.1",
    "@types/node": "16.x",
    "@types/shelljs": "^0.8.12",
    "@types/vscode": "^1.78.0",
    "@typescript-eslint/eslint-plugin": "^5.56.0",
    "@typescript-eslint/parser": "^5.56.0",
    "@vscode/test-electron": "^2.3.0",
    "eslint": "^8.36.0",
    "glob": "^8.1.0",
    "mocha": "^10.2.0",
    "typescript": "^4.9.5"
  },
  "dependencies": {
    "axios": "^1.4.0",
    "diff": "^5.1.0",
    "ohm-js": "^17.1.0",
    "shelljs": "^0.8.5"
  }
}
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

export const userActivityMonitor = new UserActivityMonitor(); // Singleton instance// fixSelectedProblem.ts
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
}import * as vscode from 'vscode';
import { COMMANDS } from './constants';
import { revealProblemSolverPanel } from './webViewPanel';
import { fixSelectedProblem } from './fixSelectedProblem';
import { startStopAgents } from './autonomousMode';
import * as Log from "./utils/outputLog";
import * as SetOpenAIKeyCommand from "./commands/SetOpenAIKeyCommand";

let enxtenstionContext: vscode.ExtensionContext;

export function activate(context: vscode.ExtensionContext) {
	console.log('Puck Bug Zapper extension is now active!');

	enxtenstionContext = context;

	Log.activate(context);
	new SetOpenAIKeyCommand.default('setOpenAIKey', 'Set OpenAI API Key', context);

	const fixNowDisposable = vscode.commands.registerCommand(COMMANDS.fixNow, () => {
		revealProblemSolverPanel();
		fixSelectedProblem();
	});

	const startAgentsDisposable = vscode.commands.registerCommand(COMMANDS.startAgents, () => {
		startStopAgents();
	});

	context.subscriptions.push(fixNowDisposable, startAgentsDisposable);
}

export function deactivate() {}

export function getExtensionContext(): vscode.ExtensionContext {
	return enxtenstionContext;
}// workspaceConfiguration.ts
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
}// webviewPanel.ts
import * as vscode from "vscode";

class ProblemSolverPanel {
  private panel: vscode.WebviewPanel;

  constructor() {
    this.panel = vscode.window.createWebviewPanel(
      "problemSolver",
      "Puck Bug Zapper",
      vscode.ViewColumn.Two,
      { enableScripts: true, retainContextWhenHidden: true }
    );
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
}/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/naming-convention */
import axios from 'axios';
import * as vscode from 'vscode';
import { log } from './outputLog';
import { getOpenAIKey } from '../commands/SetOpenAIKeyCommand';
import * as fs from 'fs';

export interface adhocChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}
export interface adhocChatConversation {
    model: string;
    messages: adhocChatMessage[];
    max_tokens?: number;
    top_p?: number;
    temperature?: number;
    stream?: boolean;
    apikey?: string;
}

const persomDelimiter = "👤";
const assistantDelimiter = "🤖";
const systemDelimiter = "🌐";

export interface MessageHistoryItem {
    conversation: adhocChatConversation;
    request: adhocChatMessage;
    response: adhocChatMessage;
}
// we save the messages in a history.json file. We save the conversation settings, the request and the response
function saveMessages(items: MessageHistoryItem[]): void {
    // we save to a messages.json file
    const config = JSON.stringify(items);
    const filePath = vscode.workspace.getConfiguration('puck.adhocChat').get('historyPath') || 'history.json';
    fs.writeFileSync(filePath as any, config);
}

export function loadMessages(): adhocChatMessage[] {
    const config = vscode.workspace.getConfiguration('puck.adhocChat');
    return config.get('messages') || [];
}

export async function sendQuery(query: adhocChatConversation): Promise<string> {

    // get the api key from settings
    const config = vscode.workspace.getConfiguration('puck.adhocChat');
    const apikey = getOpenAIKey();
    delete query.apikey;
    try {
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            JSON.stringify(query), {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apikey}`,
            },
        }
        );
        if (response.data && response.data.choices && response.data.choices.length > 0) {
            log(`Chat completion: ${response.data.choices[0].message.content}`);
            const res = response.data.choices[0].message.content;
            saveMessages([...query.messages, { role: 'assistant', content: response }] as any);
            return res;
        } else {
            // we show an error notification if the response is empt
            throw new Error('No completion found');
        }
    } catch (error: any) {
        vscode.window.showErrorMessage('Error: ' + error.message);
        throw error;
    }

}

export async function sendChatQuery(messages: any[], prompt: string, inputText?: string): Promise<adhocChatMessage[]> {

    const conversation = {
        messages: [] as any[],
        model: "gpt-4",
        temperature: 0.7,
        max_tokens: 2048,
    };

    const addToMessages = (role: string, content: string) =>
        conversation.messages.push({ role, content });
    const updates = [];

    // add the user message to the conversation object
    if(inputText) {
        addToMessages("user", inputText);
    }

    // add the existing messages to the conversation object
    if (messages.length > 0) {
        if (messages && messages.length > 0) {
            conversation.messages = messages;
            if(inputText) { addToMessages("user", inputText); }
        }

    } else {
        addToMessages("system", prompt);
    }
    
    conversation.messages = conversation.messages.map(c => ({
        content: c.content,
        role: c.role === systemDelimiter 
            ? "system" : c.role === persomDelimiter 
                ? "user" : c.role === assistantDelimiter 
                    ? "assistant" : c.role
    }));

    // send the query to the GPT API
    const result = await sendQuery(conversation);

    // add the response to the conversation object
    addToMessages("assistant", result);

    // return the conversation object
    return conversation.messages;

}

export async function streamQuery(query: adhocChatConversation, onUpdate: (data: any) => void, onComplete: (data: any) => void): Promise<string> {

    try {
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            query, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${query.apikey}`,
                },
                responseType: 'stream',
            }
        );
        let output = '';
        response.data.on('data', (chunk: any) => {
            const parsedData = JSON.parse(chunk.toString());
            onUpdate(parsedData);
            if (parsedData.choices && parsedData.choices.length > 0) {
                output += parsedData.choices[0].message.content;
            }
        });
        response.data.on('end', () => {
            onComplete(null);
        });
        response.data.on('error', (error: any) => {
            onComplete(error);
        });
        return output;
    } catch (error: any) {
        vscode.window.showErrorMessage('Error: ' + error.message);
        throw error;
    }

}

// send a query and retry if the response is not properly formed
export async function sendQueryWithRequeries(conversation: adhocChatConversation): Promise<string> {

    const _response: any[] = [];
    const _getResponse = () => _response.join('');
    const _isResponseJson = () => _getResponse().startsWith('{') || _getResponse().startsWith('[');
    const _isProperlyFormedJson = () => _isResponseJson() && (_getResponse().endsWith('}') || _getResponse().endsWith(']'));
    let isJson = false;

    const _query = async (conversation: any, iter: number) => {
        const completion = await sendQuery(conversation);
        _response.push(completion);
        return new Promise((resolve): any => {
            const responseMessage = _getResponse();
            isJson = iter === 0 && _isResponseJson();
            if (isJson) {
                if (_isProperlyFormedJson()) {
                    return resolve(responseMessage);
                } else {
                    conversation.messages.push({ role: 'assistant', content: completion });
                    return resolve(_query(conversation, iter + 1));
                }
            } else { return resolve(responseMessage); }
        });
    };
    const completion = await _query(conversation, 0);
    return completion as string;   

}
import * as vscode from 'vscode';
import * as fs from 'fs';

export function loadScript(webview: vscode.Webview, extensionUri: vscode.Uri, libName: string) {
    const libPath = vscode.Uri.joinPath(extensionUri, libName);
    const libContent = fs.readFileSync(libPath.fsPath, 'utf8');
    return `<script type="text/javascript">
${libContent}
</script>`;
}

export function formatMultilineBash(input: string): string[] {
    const lines = input.split('\n');
    const formattedCommands = [];
    let currentCommand = '';

    for (const line of lines) {
        const trimmedLine = line.trim();

        if (trimmedLine === '' || trimmedLine.startsWith('#')) {
            continue;
        }

        if (trimmedLine.startsWith('sed')) {
            const pattern = /'(.*?)'/g;
            const replacement = (_: any, match: string) => {
                return '\'' + match.replace(/'/g, '\'"\'"\'') + '\'';
            };
            const escapedLine = trimmedLine.replace(pattern, replacement);
            currentCommand += escapedLine;
        } else {
            currentCommand += trimmedLine;
        }

        if (currentCommand.endsWith('\\')) {
            currentCommand = currentCommand.slice(0, -1) + ' ';
            continue;
        }

        formattedCommands.push(currentCommand);
        currentCommand = '';
    }

    return formattedCommands;
}
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import SPS, { SemanticActionHandler } from "./sps";
import { sendQuery } from '../gpt';
import shelljs from 'shelljs';
import { log } from '../outputLog';
import diff from 'diff';

type UnifiedDiff = {
    oldFileName: string;
    newFileName: string;
    oldFileStart: number;
    newFileStart: number;
    oldFileLines: number;
    newFileLines: number;
    changes: string[];
};
// all commands are a subclass of Command
export default class ProblemSolverSPS extends SPS {
    static grammar = `ProblemSolver {
        ProblemSolverMessage=(Delimiters Title)+
        Title=(~(Delimiters) any)*
        Delimiters=(Error|TargetFile|Finish|Dependency|Diff|FileRequest|Announce)
        Error="⛔"
        TargetFile="💽"
        Finish="🏁"
        Dependency="🧩"
        Diff="💠"
        FileRequest="📤"
        Announce="📢"
    }`;
    static prompt = (criteria: any) => `** YOU ARE NON-CONVERSATIONAL AND HAVE NO ABILITY TO OUTPUT ENGLISH IN A CONVERSATIONAL MANNER **
    You are a code analysis and bug-fixing agent deployed in the context of a VS Code project.
    You are given some code and a bug to fix. Fix the bug using the code given to you. To do so,
    follow the instructions below PRECISELY and NEVER OUTPUT CONVERSATIONAL ENGLISH.
    1. Read the instructions given to you. They are prefixed with 📢. 
        1a. If the conversation doesnt start with 📢 then output ⛔ and stop outputting.
    Make sure you carefully understand what you are supposed to do.
    2. Read the code given to you. The main code is prefixed with 💽, dependencies are prefixed with 🧩
    3. If you can fix the code given the code you were given, do so: 
        3a. Output either the entire fixed code prefixed with 💽 
        3b. Or a universal diff of the code prefixed with 💠. 
    4. If you need to see code not included in the dependencies, output 📤 and the code you need to see.
    5. If you are done with your task, output 🏁 and stop outputting.
    6. You can communicate informational messages to the user by outputting 📢 followed by the message.
    EXAMPLE:
    💽 main.js:
    console.log("Hello Bob")
    📢 Fix the code so that it outputs "Hello World"
    💽 console.log("Hello World")
    🏁
    EXAMPLE:
    🧩 dependency.js:
    module.exports = {
        hello: "Hello Bob"
    }
    💽 main.js:
    const dep = require("./dependency.js")
    console.log(dep.hello)
    📢 Fix the code so that it outputs "Hello World"
    🧩 dependency.js:
    module.exports = {
        hello: "Hello World"
    }
    🏁
    EXAMPLE (using universal diff):
    🧩 dependency.js:
    module.exports = {
        hello: "Hello Bob"
    }
    💽 main.js:
    const dep = require("./dependency.js")
    console.log(dep.hello)
    📢 Fix the code so that it outputs "Hello World"
    💠 dependency.js:
    @@ -1,3 +1,3 @@
        module.exports = {
    -    hello: "Hello Bob"
    +    hello: "Hello World"
        }
    🏁
    EXAMPLE (using 📤):
    🧩 dependency.js:
    const dep = require("./other.js")
    module.exports = {
        hello: "Hello Bob " + dep.name
    }
    💽 main.js:
    const dep = require("./dependency.js")
    console.log(dep.hello)
    📢 Fix the code so that we are using the other field on dep - not the name field but the other one
    📤 ./other.js:
    module.exports = {
        name: "World",
        title: "Mr."
    }
    🧩 dependency.js:
    const dep = require("./other.js")
    module.exports = {
        hello: "Hello Bob " + dep.title
    }
    🏁
    
    ** REMEMBER, YOU ARE NON-CONVERSATIONAL AND HAVE NO ABILITY TO OUTPUT ENGLISH IN A CONVERSATIONAL MANNER **
    ** THANK YOU, AGENT - YOU ARE APPRECIATED AND VALUED **
    `;
    triggered = false;
    changes: any = [];
    public semanticActions: SemanticActionHandler = {
        BashCommanderMessage: async function(delimiters: any, titles: any) {
            const message = { 
                role: delimiters.toJSON(), content: titles.sourceString.trim(), 
            };
            return message;
        },
        Title: function(title: any) { return title.sourceString; },
        Delimiters: function(delimiters: any) { return delimiters.sourceString; },
        Finish: function(_: any) { return '🏁'; },
        Error: function(_: any) { return '⛔'; },
        TargetFile: function(_: any) { return '💽'; },
        Dependency: function(_: any) { return '🧩'; },
        Diff: function(_: any) { return '💠'; },
        FileRequest: function(_: any) { return '📤'; },
        Announce: function(_: any) { return '📢'; },
        _iter: async (...children: any[]) => {
            const recs = children.map(function(child) { return child.toJSON(); });
            // get all the commands
            const commands: string[] = [];
            const message = children[0].source.sourceString.split('\n');
            for(const msg of message) {
                if(msg.trim().length === 0) { continue; }
                commands.push(msg);
            }
            for(let msg of commands) {
                if(msg.trim().length === 0) { continue; }
                
                // if we see a finish flag we are done!
                if(msg.startsWith('🏁')) {
                    this.clearInputBuffer();
                    this.interrupt();
                    return this.changes;
                }
                
                // we process the request for a file - we return the file contents to the AI
                else if(msg.startsWith('📤')) {
                    let file = await this._processFileRequest(msg);
                    const filePath = msg.split('📤')[1].trim();
                    this.addMessageToInputBuffer({ role: 'assistant', content: msg });
                    this.addMessageToInputBuffer({ role: 'user', content: `${filePath}:\n${file}` });
                }

                // if the message starts with a 💽' or a '🧩' then we have the primary file
                else if(msg.startsWith('💽') || msg.startsWith('🧩')) {
                    const change = await this._processFileUpdate(msg);
                    this.changes.push(change);
                }

                // if the message starts with a 💠 then we have a diff
                else if(msg.startsWith('💠')) {
                    const change = await this._processDiffRequest(msg);
                    this.changes.push(change);
                }

                // if the command starts with a 📢 then we need to output a message
                else if(msg.startsWith('📢')) {
                    this.addMessageToInputBuffer({ role: 'assistant', content: msg });
                }

                const delimiters = [ '🧩', '💽', '💠', '📤', '📢' ];
                // if the message doesn't start with any of the delimiters them we return an error
                if(!delimiters.some((delimiter) => msg.startsWith(delimiter))) {
                    this.addMessageToInputBuffer({ 
                        role: 'system', 
                        content: 'ERROR: Unrecognized command. NO CONVERSATIONAL OUTPUT. Please review instructions and try again.'
                    });
                    break;
                }
                log(msg);
            }
            return this.changes;
        }
    };

    constructor(public context: vscode.ExtensionContext, criteria: string) {
        super(
            ProblemSolverSPS.prompt(criteria), ProblemSolverSPS.grammar
        );
    }

    async _processFileRequest(msg: string): Promise<string> {
        const file = msg.replace('📤', '').trim();
        const fileContents = await vscode.workspace.fs.readFile(vscode.Uri.file(file));
        const fileContentsStr = new TextDecoder().decode(fileContents);
        return fileContentsStr;
    }

    async _processFileUpdate(msg: string): Promise<any> {
        let file = msg.replace('💽', '').trim();
        file = msg.replace('🧩', '').trim();
        const fileContentsStr = msg.split('\n').slice(1).join('\n');
        const updatedFile = {
            file: file,
            contents: fileContentsStr
        };
        return updatedFile;
    }

    async _processDiffRequest(msg: string): Promise<any> {
        const file = msg.replace('💠', '').trim();
        const fileContents = await vscode.workspace.fs.readFile(vscode.Uri.file(file));
        const fileContentsStr = new TextDecoder().decode(fileContents);
        // use the diff npm lib to apply the patch
        let patchedContents = fileContentsStr;
        const parsedDiff = diff.parsePatch(fileContentsStr);
        for(const d of parsedDiff) {
            patchedContents = diff.applyPatch(fileContentsStr, d);
        }
        const updatedFile = {
            file: file,
            contents: patchedContents
        };
        return updatedFile;
    }

    _outputMessage(msg: string): void {
        log(msg.replace('📢', '').trim());
    }

    async _getSourceCodeDependencies(file: string): Promise<string[]> {
        // the user request is a file path. We need to load the file and add it to the input buffer
        const fileContents = await vscode.workspace.fs.readFile(vscode.Uri.file(file));
        const dependencies = [];
        const result = await sendQuery({
            model: 'gpt-4',
            temperature: 0.7,
            max_tokens: 1024,
            top_p: 1,
            messages: [{
                role: 'system',
                content: `You are a source code dependency file list generator. Given source code and the path to the project it came from, you return the paths of the file's dependencies as a json array. Do not include third-party libraries in your result. If you cannot determine the file's dependencies or if it has none, then output an empty array.`
            },{
                role: 'user',
                content: `project path: ${file}\n\nsource code:\n${new TextDecoder().decode(fileContents)}`
            }]
        });
        try {
            const deps = JSON.parse(result).dependencies;
            for(const dep of deps ) {
            // load the file and add it to the input buffer
            const depContents = await vscode.workspace.fs.readFile(vscode.Uri.file(dep));
            dependencies.push(new TextDecoder().decode(depContents));
            }
            dependencies.push(...deps);
        } catch (err: any) {
            log(err);
            return [];
        }
        return dependencies;
    }
    
    async handleUserRequest(fileName: string, semanticActionHandler: SemanticActionHandler = this.semanticActions) {
        // the user request is a file path. We need to load the file and add it to the input buffer
        const fileContents = await vscode.workspace.fs.readFile(vscode.Uri.file(fileName));
        const dependencies = await this._getSourceCodeDependencies(fileName);
        for(const dep of dependencies) {
            // get the file contents
            const fileContents = await vscode.workspace.fs.readFile(vscode.Uri.file(dep));
            this.addMessageToInputBuffer({
                role: 'user',
                content: `🧩 ${dep}\n\n${new TextDecoder().decode(fileContents)}\n\n`
            });
        }
        // add the user request to the input
        this.addMessageToInputBuffer({
            role: 'user',
            content: `💽 ${fileName}:\n\n${fileContents}`
        });
        // execute the user request
        return await this.execute(semanticActionHandler);
    }

    parseUnifiedDiff(input: string): UnifiedDiff[] {
        const lines = input.split('\n');
        const unifiedDiffs: UnifiedDiff[] = [];
        let currentDiff: UnifiedDiff | null = null;
        let insideDiff = false;
        for (const line of lines) {
            if (line.startsWith('--- ')) {
                if (currentDiff) {
                    unifiedDiffs.push(currentDiff);
                }
                currentDiff = {
                    oldFileName: line.substr(4).trim(),
                    newFileName: '',
                    oldFileStart: 0,
                    newFileStart: 0,
                    oldFileLines: 0,
                    newFileLines: 0,
                    changes: [],
                };
                insideDiff = false;
            } else if (line.startsWith('+++ ')) {
                if (currentDiff) {
                    currentDiff.newFileName = line.substr(4).trim();
                }
            } else if (line.startsWith('@@ ')) {
                const match = line.match(/@@ -(\d+),(\d+) \+(\d+),(\d+) @@/);
                if (match && currentDiff) {
                    currentDiff.oldFileStart = parseInt(match[1], 10);
                    currentDiff.oldFileLines = parseInt(match[2], 10);
                    currentDiff.newFileStart = parseInt(match[3], 10);
                    currentDiff.newFileLines = parseInt(match[4], 10);
                }
                insideDiff = true;
            } else if (currentDiff && insideDiff) {
                if (line.startsWith('+') || line.startsWith('-') || line.startsWith(' ')) {
                    currentDiff.changes.push(line);
                } else {
                    insideDiff = false;
                }
            }
        }
        if (currentDiff) {
            unifiedDiffs.push(currentDiff);
        }
        return unifiedDiffs;
    }

    clearInputBuffer() {
        this.inputBuffer = [];
    }
}



/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as Ohm from 'ohm-js';
import * as fs from 'fs';
import { adhocChatMessage, sendQuery } from '../gpt';

// an action handler for a semantic action
export type SemanticActionHandler = Ohm.ActionDict<unknown>;

// a semantic prompt structure - consists of a prompt, a grammar file, and semantic action handler
export default class SPS {
    protected prompt: string;
    private grammarFile: string;
    private semanticActionHandler: SemanticActionHandler | undefined;
    protected inputBuffer: adhocChatMessage[];
    private _executing: boolean;
    private _interrupted: boolean;
    private _llmOptions: any;
    // prompt and grammar file are required
    constructor(prompt: string, grammarFile: string, llmOptions = {
        model: 'gpt-4',
        temperature: 0.7,
        max_tokens: 2048,
        top_p: 1,
        messages: []
    }) {
        this.prompt = prompt;
        this.grammarFile = grammarFile;
        this.inputBuffer = [];
        this._executing = false;
        this._interrupted = false;
        this._llmOptions = llmOptions;
    }
    // add a message to the input buffer to send to the LLM
    addMessageToInputBuffer(message: adhocChatMessage): void { this.inputBuffer.push(message); }
    interrupt(): void { this._interrupted = true; }
    
    // perform a single iteration of the SPS
    async iterate(semanticActionHandler: SemanticActionHandler): Promise<any> {
        this.semanticActionHandler = semanticActionHandler;
        let response = await sendQuery({
            model: 'gpt-4',
            temperature: 0.8,
            max_tokens: 2048,
            top_p: 0.8,
            messages: [{
                role: 'system',
                content: this.prompt
            }, ...this.inputBuffer.map((message) => ({
                role: message.role,
                content: message.content
            })) as any]
        });
        try {
            response += '\n';
            const { grammar, semantics } = this.loadGrammar(this.grammarFile);
            const ohmParser = semantics.addOperation("toJSON", this.semanticActionHandler);
            const match = grammar.match(response);
            if (!match.failed()) {
                const result = await ohmParser(match).toJSON();
                return result;
            } else { 
                this.addMessageToInputBuffer({
                    role: 'system',
                    content: 'INVALID OUTPUT FORMAT. Please review the instructions and try again.'
                });
                console.log(`invalid output format: ${response}`);
                await this.iterate(semanticActionHandler);
            }
        } catch (e) { 
            await this.iterate(semanticActionHandler);
        }
    }

    // execute the SPS - iterates until explicitly disabled
    async execute(semanticActionHandler: SemanticActionHandler): Promise<any> {
        this._executing = true;
        const _run = async (): Promise<any> => {
            if (!this._executing) { return; }
            const result = await this.iterate(semanticActionHandler);
            if (result && result.stop) { // execution can be stopped by the semantic action handler
                this._executing = false;
                console.log('Execution stopped');
                return result;
            }
            if (this._interrupted) {
                this._executing = false;
                this._interrupted = false;
                return result;
            } 
            return await _run();
        }; 
        return await _run();
    }

    // serialize the SPS to a file
    serializeToFile(filePath: string): void {
        const serializedData = JSON.stringify({
            prompt: this.prompt,
            grammarFile: this.grammarFile,
            inputBuffer: this.inputBuffer,
        });
        fs.writeFileSync(filePath, serializedData);
    }

    // deserialize from file
    static deserializeFromFile(filePath: string): SPS {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const deserializedData = JSON.parse(fileContent);
        const sps = new SPS(
            deserializedData.prompt,
            deserializedData.grammarFile);
        sps.inputBuffer = deserializedData.inputBuffer;
        return sps;
    }

    // load the SPS grammar
    private loadGrammar(grammarFile: string) {
        // Read the grammar file and return an Ohm.js grammar object
        const grammar = Ohm.grammar(grammarFile);
        const semantics = grammar.createSemantics();
        return { grammar, semantics };
    }
}
import * as vscode from 'vscode';
import * as fs from 'fs';

export function loadStyle(webview: vscode.Webview, extensionUri: vscode.Uri, libName: string) {
    const libPath = vscode.Uri.joinPath(extensionUri, libName);
    const libContent = fs.readFileSync(libPath.fsPath, 'utf8');
    return `<style>
${libContent}
</style>`;
}
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as vscode from 'vscode';
import { commands, ExtensionContext } from 'vscode';

// unregister the command
function unregisterCommand(commandId: string): void {
    const commandsList = vscode.commands.getCommands(false);
    commandsList.then((commands) => {
        if (commands.includes(commandId)) {
            vscode.commands.executeCommand('workbench.action.removeCommand', commandId);
        }
    });
}

// execute the command
async function executeCommand(commandId: string, ...args: any[]): Promise<any> {
    try {
        const result = await vscode.commands.executeCommand(commandId, ...args);
        return result;
    } catch (error) {
        console.error(`Error executing command ${commandId}:`, error);
        throw error;
    }
}

export abstract class Command {

    // Constructor
    constructor(public commandId: string, public title: string, public context: ExtensionContext) {
        const commandDisposable = commands.registerCommand(commandId, this.execute, this);
        context.subscriptions.push(commandDisposable);
        this.onDidRegister();
    }

    // To be overridden by subclasses, execute the command logic
    abstract execute(...args: any[]): Promise<void>;

    // Check if the command can be executed in the current context
    isExecutable(): boolean {
        // Default implementation returns true, can be overridden by subclasses
        return true;
    }

    // Called when the command registration with VS Code is completed
    protected onDidRegister(): void {
        // Default implementation is empty, can be overridden by subclasses
    }

    // Called before the command is unregistered from VS Code
    protected async onWillUnregister(): Promise<void> {
        // Default implementation is empty, can be overridden by subclasses
    }

    // Get the command ID
    getId(): string {
        return this.commandId;
    }

    // Get the command's VS Code Extension Context
    getCommandContext(): ExtensionContext {
        return this.context;
    }

    // Register the command with VS Code
    static async register<T extends Command>(this: new (context: ExtensionContext) => T, context: ExtensionContext): Promise<T> {
        const command = new this(context);
        return command;
    }

    // Unregister the command from VS Code
    static async unregister(command: Command): Promise<void> {
        await command.onWillUnregister();
        command.getCommandContext().subscriptions.forEach((subscription) => {
            subscription.dispose();
        });
        unregisterCommand(command.getId());
    }

    // Execute the command
    static async execute(commandId: string, ...args: any[]): Promise<any> {
        return executeCommand(commandId, ...args);
    }
}/* eslint-disable @typescript-eslint/no-unused-vars */
import * as vscode from 'vscode';

// This method is called when your extension is activated
export function activate(_context: vscode.ExtensionContext) {
    log('Puck Bug Zapper');
}

export function deactivate() {
    // nothing to do
}

// log a message to the output channel
let outputChannel: vscode.OutputChannel;

export function log(message: string, showChannel = false) {
    if(!outputChannel) { outputChannel = vscode.window.createOutputChannel('Puck Bug Zapper'); }
    outputChannel.appendLine(message);
    if(showChannel) { outputChannel.show(); }
}import * as vscode from "vscode";
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
}// constants.ts

const SUPPORTED_EXTENSIONS = ['.ts', '.tsx'];

const COMMANDS = {
    fixNow: 'puck.problemSolver.fixNow',
    startAgents: 'puck.problemSolver.startAgents',
    stopAgents: 'puck.problemSolver.stopAgents',
};

const BUG_ZAPPER_JSON_FILENAME = 'bug-zapper.json';

export { SUPPORTED_EXTENSIONS, COMMANDS, BUG_ZAPPER_JSON_FILENAME };// utility.ts

import * as Diff from 'diff';

export function applyDiffPatch(originalCode: string, diffPatch: string): string {
  const diff = Diff.parsePatch(diffPatch);
  const updatedCode = Diff.applyPatch(originalCode, diff as any);
  return updatedCode;
}/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-case-declarations */
/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from "vscode";
import { Command } from "../utils/Command";

const org = "puck.adhocChat";

export default class SetOpenAIKeyCommand extends Command {
    constructor(commandId: string, title: string, context: vscode.ExtensionContext) {
        super(`${org}.${commandId}`, title, context);
    }

    async execute() {
        const apiKey = await vscode.window.showInputBox({
            prompt: 'Enter your OpenAI API key',
            ignoreFocusOut: true,
            password: true,
        });
        if (apiKey) {
            setOpenAIKey(apiKey);
            vscode.window.showInformationMessage('OpenAI API key saved successfully');
        } else {
            vscode.window.showErrorMessage('Invalid API key. Please try again');
        }
    }
}

export function getOpenAIKey(): string {
    const config = vscode.workspace.getConfiguration(org);
    return config.get('apikey') || '';
}

async function setOpenAIKey(openAIKey: string): Promise<void> {
    try {
        await vscode.workspace.getConfiguration(org).update('apikey', openAIKey, vscode.ConfigurationTarget.Global);
        const config = vscode.workspace.getConfiguration(org);
        if (config.has('apikey')) {
            vscode.window.showInformationMessage('OpenAI API key saved successfully');
        } else {
            vscode.window.showErrorMessage('Failed to save OpenAI API key');
        }
    } catch (error: any) {
        vscode.window.showErrorMessage(`Error updating configuration: ${error.message}`);
    }
}import * as vscode from "vscode";

import SetOpenAIKeyCommand from "./SetOpenAIKeyCommand";

export function activate(context: vscode.ExtensionContext) {

    new SetOpenAIKeyCommand("setOpenAIKey", "Set OpenAI Key", context);
}


export function deactivate() { }// autonomousMode.ts
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
### ./src/userActivityMonitor.ts
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

export const userActivityMonitor = new UserActivityMonitor(); // Singleton instance### ./src/fixSelectedProblem.ts
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
}### ./src/extension.ts
import * as vscode from 'vscode';
import { COMMANDS } from './constants';
import { revealProblemSolverPanel } from './webViewPanel';
import { fixSelectedProblem } from './fixSelectedProblem';
import { startStopAgents } from './autonomousMode';
import * as Log from "./utils/outputLog";
import * as SetOpenAIKeyCommand from "./commands/SetOpenAIKeyCommand";

let enxtenstionContext: vscode.ExtensionContext;

export function activate(context: vscode.ExtensionContext) {
	console.log('Puck Bug Zapper extension is now active!');

	enxtenstionContext = context;

	Log.activate(context);
	new SetOpenAIKeyCommand.default('setOpenAIKey', 'Set OpenAI API Key', context);

	const fixNowDisposable = vscode.commands.registerCommand(COMMANDS.fixNow, () => {
		revealProblemSolverPanel();
		fixSelectedProblem();
	});

	const startAgentsDisposable = vscode.commands.registerCommand(COMMANDS.startAgents, () => {
		startStopAgents();
	});

	context.subscriptions.push(fixNowDisposable, startAgentsDisposable);
}

export function deactivate() {}

export function getExtensionContext(): vscode.ExtensionContext {
	return enxtenstionContext;
}### ./src/workspaceConfiguration.ts
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
}### ./src/webViewPanel.ts
// webviewPanel.ts
import * as vscode from "vscode";

class ProblemSolverPanel {
  private panel: vscode.WebviewPanel;

  constructor() {
    this.panel = vscode.window.createWebviewPanel(
      "problemSolver",
      "Puck Bug Zapper",
      vscode.ViewColumn.Two,
      { enableScripts: true, retainContextWhenHidden: true }
    );
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
}### ./src/utils/gpt.ts
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/naming-convention */
import axios from 'axios';
import * as vscode from 'vscode';
import { log } from './outputLog';
import { getOpenAIKey } from '../commands/SetOpenAIKeyCommand';
import * as fs from 'fs';

export interface adhocChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}
export interface adhocChatConversation {
    model: string;
    messages: adhocChatMessage[];
    max_tokens?: number;
    top_p?: number;
    temperature?: number;
    stream?: boolean;
    apikey?: string;
}

const persomDelimiter = "👤";
const assistantDelimiter = "🤖";
const systemDelimiter = "🌐";

export interface MessageHistoryItem {
    conversation: adhocChatConversation;
    request: adhocChatMessage;
    response: adhocChatMessage;
}
// we save the messages in a history.json file. We save the conversation settings, the request and the response
function saveMessages(items: MessageHistoryItem[]): void {
    // we save to a messages.json file
    const config = JSON.stringify(items);
    const filePath = vscode.workspace.getConfiguration('puck.adhocChat').get('historyPath') || 'history.json';
    fs.writeFileSync(filePath as any, config);
}

export function loadMessages(): adhocChatMessage[] {
    const config = vscode.workspace.getConfiguration('puck.adhocChat');
    return config.get('messages') || [];
}

export async function sendQuery(query: adhocChatConversation): Promise<string> {

    // get the api key from settings
    const config = vscode.workspace.getConfiguration('puck.adhocChat');
    const apikey = getOpenAIKey();
    delete query.apikey;
    try {
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            JSON.stringify(query), {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apikey}`,
            },
        }
        );
        if (response.data && response.data.choices && response.data.choices.length > 0) {
            log(`Chat completion: ${response.data.choices[0].message.content}`);
            const res = response.data.choices[0].message.content;
            saveMessages([...query.messages, { role: 'assistant', content: response }] as any);
            return res;
        } else {
            // we show an error notification if the response is empt
            throw new Error('No completion found');
        }
    } catch (error: any) {
        vscode.window.showErrorMessage('Error: ' + error.message);
        throw error;
    }

}

export async function sendChatQuery(messages: any[], prompt: string, inputText?: string): Promise<adhocChatMessage[]> {

    const conversation = {
        messages: [] as any[],
        model: "gpt-4",
        temperature: 0.7,
        max_tokens: 2048,
    };

    const addToMessages = (role: string, content: string) =>
        conversation.messages.push({ role, content });
    const updates = [];

    // add the user message to the conversation object
    if(inputText) {
        addToMessages("user", inputText);
    }

    // add the existing messages to the conversation object
    if (messages.length > 0) {
        if (messages && messages.length > 0) {
            conversation.messages = messages;
            if(inputText) { addToMessages("user", inputText); }
        }

    } else {
        addToMessages("system", prompt);
    }
    
    conversation.messages = conversation.messages.map(c => ({
        content: c.content,
        role: c.role === systemDelimiter 
            ? "system" : c.role === persomDelimiter 
                ? "user" : c.role === assistantDelimiter 
                    ? "assistant" : c.role
    }));

    // send the query to the GPT API
    const result = await sendQuery(conversation);

    // add the response to the conversation object
    addToMessages("assistant", result);

    // return the conversation object
    return conversation.messages;

}

export async function streamQuery(query: adhocChatConversation, onUpdate: (data: any) => void, onComplete: (data: any) => void): Promise<string> {

    try {
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            query, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${query.apikey}`,
                },
                responseType: 'stream',
            }
        );
        let output = '';
        response.data.on('data', (chunk: any) => {
            const parsedData = JSON.parse(chunk.toString());
            onUpdate(parsedData);
            if (parsedData.choices && parsedData.choices.length > 0) {
                output += parsedData.choices[0].message.content;
            }
        });
        response.data.on('end', () => {
            onComplete(null);
        });
        response.data.on('error', (error: any) => {
            onComplete(error);
        });
        return output;
    } catch (error: any) {
        vscode.window.showErrorMessage('Error: ' + error.message);
        throw error;
    }

}

// send a query and retry if the response is not properly formed
export async function sendQueryWithRequeries(conversation: adhocChatConversation): Promise<string> {

    const _response: any[] = [];
    const _getResponse = () => _response.join('');
    const _isResponseJson = () => _getResponse().startsWith('{') || _getResponse().startsWith('[');
    const _isProperlyFormedJson = () => _isResponseJson() && (_getResponse().endsWith('}') || _getResponse().endsWith(']'));
    let isJson = false;

    const _query = async (conversation: any, iter: number) => {
        const completion = await sendQuery(conversation);
        _response.push(completion);
        return new Promise((resolve): any => {
            const responseMessage = _getResponse();
            isJson = iter === 0 && _isResponseJson();
            if (isJson) {
                if (_isProperlyFormedJson()) {
                    return resolve(responseMessage);
                } else {
                    conversation.messages.push({ role: 'assistant', content: completion });
                    return resolve(_query(conversation, iter + 1));
                }
            } else { return resolve(responseMessage); }
        });
    };
    const completion = await _query(conversation, 0);
    return completion as string;   

}
### ./src/utils/scripts.ts
import * as vscode from 'vscode';
import * as fs from 'fs';

export function loadScript(webview: vscode.Webview, extensionUri: vscode.Uri, libName: string) {
    const libPath = vscode.Uri.joinPath(extensionUri, libName);
    const libContent = fs.readFileSync(libPath.fsPath, 'utf8');
    return `<script type="text/javascript">
${libContent}
</script>`;
}

export function formatMultilineBash(input: string): string[] {
    const lines = input.split('\n');
    const formattedCommands = [];
    let currentCommand = '';

    for (const line of lines) {
        const trimmedLine = line.trim();

        if (trimmedLine === '' || trimmedLine.startsWith('#')) {
            continue;
        }

        if (trimmedLine.startsWith('sed')) {
            const pattern = /'(.*?)'/g;
            const replacement = (_: any, match: string) => {
                return '\'' + match.replace(/'/g, '\'"\'"\'') + '\'';
            };
            const escapedLine = trimmedLine.replace(pattern, replacement);
            currentCommand += escapedLine;
        } else {
            currentCommand += trimmedLine;
        }

        if (currentCommand.endsWith('\\')) {
            currentCommand = currentCommand.slice(0, -1) + ' ';
            continue;
        }

        formattedCommands.push(currentCommand);
        currentCommand = '';
    }

    return formattedCommands;
}
### ./src/utils/sps/bugzapper.ts
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import SPS, { SemanticActionHandler } from "./sps";
import { sendQuery } from '../gpt';
import shelljs from 'shelljs';
import { log } from '../outputLog';
import diff from 'diff';

type UnifiedDiff = {
    oldFileName: string;
    newFileName: string;
    oldFileStart: number;
    newFileStart: number;
    oldFileLines: number;
    newFileLines: number;
    changes: string[];
};
// all commands are a subclass of Command
export default class ProblemSolverSPS extends SPS {
    static grammar = `ProblemSolver {
        ProblemSolverMessage=(Delimiters Title)+
        Title=(~(Delimiters) any)*
        Delimiters=(Error|TargetFile|Finish|Dependency|Diff|FileRequest|Announce)
        Error="⛔"
        TargetFile="💽"
        Finish="🏁"
        Dependency="🧩"
        Diff="💠"
        FileRequest="📤"
        Announce="📢"
    }`;
    static prompt = (criteria: any) => `** YOU ARE NON-CONVERSATIONAL AND HAVE NO ABILITY TO OUTPUT ENGLISH IN A CONVERSATIONAL MANNER **
    You are a code analysis and bug-fixing agent deployed in the context of a VS Code project.
    You are given some code and a bug to fix. Fix the bug using the code given to you. To do so,
    follow the instructions below PRECISELY and NEVER OUTPUT CONVERSATIONAL ENGLISH.
    1. Read the instructions given to you. They are prefixed with 📢. 
        1a. If the conversation doesnt start with 📢 then output ⛔ and stop outputting.
    Make sure you carefully understand what you are supposed to do.
    2. Read the code given to you. The main code is prefixed with 💽, dependencies are prefixed with 🧩
    3. If you can fix the code given the code you were given, do so: 
        3a. Output either the entire fixed code prefixed with 💽 
        3b. Or a universal diff of the code prefixed with 💠. 
    4. If you need to see code not included in the dependencies, output 📤 and the code you need to see.
    5. If you are done with your task, output 🏁 and stop outputting.
    6. You can communicate informational messages to the user by outputting 📢 followed by the message.
    EXAMPLE:
    💽 main.js:
    console.log("Hello Bob")
    📢 Fix the code so that it outputs "Hello World"
    💽 console.log("Hello World")
    🏁
    EXAMPLE:
    🧩 dependency.js:
    module.exports = {
        hello: "Hello Bob"
    }
    💽 main.js:
    const dep = require("./dependency.js")
    console.log(dep.hello)
    📢 Fix the code so that it outputs "Hello World"
    🧩 dependency.js:
    module.exports = {
        hello: "Hello World"
    }
    🏁
    EXAMPLE (using universal diff):
    🧩 dependency.js:
    module.exports = {
        hello: "Hello Bob"
    }
    💽 main.js:
    const dep = require("./dependency.js")
    console.log(dep.hello)
    📢 Fix the code so that it outputs "Hello World"
    💠 dependency.js:
    @@ -1,3 +1,3 @@
        module.exports = {
    -    hello: "Hello Bob"
    +    hello: "Hello World"
        }
    🏁
    EXAMPLE (using 📤):
    🧩 dependency.js:
    const dep = require("./other.js")
    module.exports = {
        hello: "Hello Bob " + dep.name
    }
    💽 main.js:
    const dep = require("./dependency.js")
    console.log(dep.hello)
    📢 Fix the code so that we are using the other field on dep - not the name field but the other one
    📤 ./other.js:
    module.exports = {
        name: "World",
        title: "Mr."
    }
    🧩 dependency.js:
    const dep = require("./other.js")
    module.exports = {
        hello: "Hello Bob " + dep.title
    }
    🏁
    
    ** REMEMBER, YOU ARE NON-CONVERSATIONAL AND HAVE NO ABILITY TO OUTPUT ENGLISH IN A CONVERSATIONAL MANNER **
    ** THANK YOU, AGENT - YOU ARE APPRECIATED AND VALUED **
    `;
    triggered = false;
    changes: any = [];
    public semanticActions: SemanticActionHandler = {
        BashCommanderMessage: async function(delimiters: any, titles: any) {
            const message = { 
                role: delimiters.toJSON(), content: titles.sourceString.trim(), 
            };
            return message;
        },
        Title: function(title: any) { return title.sourceString; },
        Delimiters: function(delimiters: any) { return delimiters.sourceString; },
        Finish: function(_: any) { return '🏁'; },
        Error: function(_: any) { return '⛔'; },
        TargetFile: function(_: any) { return '💽'; },
        Dependency: function(_: any) { return '🧩'; },
        Diff: function(_: any) { return '💠'; },
        FileRequest: function(_: any) { return '📤'; },
        Announce: function(_: any) { return '📢'; },
        _iter: async (...children: any[]) => {
            const recs = children.map(function(child) { return child.toJSON(); });
            // get all the commands
            const commands: string[] = [];
            const message = children[0].source.sourceString.split('\n');
            for(const msg of message) {
                if(msg.trim().length === 0) { continue; }
                commands.push(msg);
            }
            for(let msg of commands) {
                if(msg.trim().length === 0) { continue; }
                
                // if we see a finish flag we are done!
                if(msg.startsWith('🏁')) {
                    this.clearInputBuffer();
                    this.interrupt();
                    return this.changes;
                }
                
                // we process the request for a file - we return the file contents to the AI
                else if(msg.startsWith('📤')) {
                    let file = await this._processFileRequest(msg);
                    const filePath = msg.split('📤')[1].trim();
                    this.addMessageToInputBuffer({ role: 'assistant', content: msg });
                    this.addMessageToInputBuffer({ role: 'user', content: `${filePath}:\n${file}` });
                }

                // if the message starts with a 💽' or a '🧩' then we have the primary file
                else if(msg.startsWith('💽') || msg.startsWith('🧩')) {
                    const change = await this._processFileUpdate(msg);
                    this.changes.push(change);
                }

                // if the message starts with a 💠 then we have a diff
                else if(msg.startsWith('💠')) {
                    const change = await this._processDiffRequest(msg);
                    this.changes.push(change);
                }

                // if the command starts with a 📢 then we need to output a message
                else if(msg.startsWith('📢')) {
                    this.addMessageToInputBuffer({ role: 'assistant', content: msg });
                }

                const delimiters = [ '🧩', '💽', '💠', '📤', '📢' ];
                // if the message doesn't start with any of the delimiters them we return an error
                if(!delimiters.some((delimiter) => msg.startsWith(delimiter))) {
                    this.addMessageToInputBuffer({ 
                        role: 'system', 
                        content: 'ERROR: Unrecognized command. NO CONVERSATIONAL OUTPUT. Please review instructions and try again.'
                    });
                    break;
                }
                log(msg);
            }
            return this.changes;
        }
    };

    constructor(public context: vscode.ExtensionContext, criteria: string) {
        super(
            ProblemSolverSPS.prompt(criteria), ProblemSolverSPS.grammar
        );
    }

    async _processFileRequest(msg: string): Promise<string> {
        const file = msg.replace('📤', '').trim();
        const fileContents = await vscode.workspace.fs.readFile(vscode.Uri.file(file));
        const fileContentsStr = new TextDecoder().decode(fileContents);
        return fileContentsStr;
    }

    async _processFileUpdate(msg: string): Promise<any> {
        let file = msg.replace('💽', '').trim();
        file = msg.replace('🧩', '').trim();
        const fileContentsStr = msg.split('\n').slice(1).join('\n');
        const updatedFile = {
            file: file,
            contents: fileContentsStr
        };
        return updatedFile;
    }

    async _processDiffRequest(msg: string): Promise<any> {
        const file = msg.replace('💠', '').trim();
        const fileContents = await vscode.workspace.fs.readFile(vscode.Uri.file(file));
        const fileContentsStr = new TextDecoder().decode(fileContents);
        // use the diff npm lib to apply the patch
        let patchedContents = fileContentsStr;
        const parsedDiff = diff.parsePatch(fileContentsStr);
        for(const d of parsedDiff) {
            patchedContents = diff.applyPatch(fileContentsStr, d);
        }
        const updatedFile = {
            file: file,
            contents: patchedContents
        };
        return updatedFile;
    }

    _outputMessage(msg: string): void {
        log(msg.replace('📢', '').trim());
    }

    async _getSourceCodeDependencies(file: string): Promise<string[]> {
        // the user request is a file path. We need to load the file and add it to the input buffer
        const fileContents = await vscode.workspace.fs.readFile(vscode.Uri.file(file));
        const dependencies = [];
        const result = await sendQuery({
            model: 'gpt-4',
            temperature: 0.7,
            max_tokens: 1024,
            top_p: 1,
            messages: [{
                role: 'system',
                content: `You are a source code dependency file list generator. Given source code and the path to the project it came from, you return the paths of the file's dependencies as a json array. Do not include third-party libraries in your result. If you cannot determine the file's dependencies or if it has none, then output an empty array.`
            },{
                role: 'user',
                content: `project path: ${file}\n\nsource code:\n${new TextDecoder().decode(fileContents)}`
            }]
        });
        try {
            const deps = JSON.parse(result).dependencies;
            for(const dep of deps ) {
            // load the file and add it to the input buffer
            const depContents = await vscode.workspace.fs.readFile(vscode.Uri.file(dep));
            dependencies.push(new TextDecoder().decode(depContents));
            }
            dependencies.push(...deps);
        } catch (err: any) {
            log(err);
            return [];
        }
        return dependencies;
    }
    
    async handleUserRequest(fileName: string, semanticActionHandler: SemanticActionHandler = this.semanticActions) {
        // the user request is a file path. We need to load the file and add it to the input buffer
        const fileContents = await vscode.workspace.fs.readFile(vscode.Uri.file(fileName));
        const dependencies = await this._getSourceCodeDependencies(fileName);
        for(const dep of dependencies) {
            // get the file contents
            const fileContents = await vscode.workspace.fs.readFile(vscode.Uri.file(dep));
            this.addMessageToInputBuffer({
                role: 'user',
                content: `🧩 ${dep}\n\n${new TextDecoder().decode(fileContents)}\n\n`
            });
        }
        // add the user request to the input
        this.addMessageToInputBuffer({
            role: 'user',
            content: `💽 ${fileName}:\n\n${fileContents}`
        });
        // execute the user request
        return await this.execute(semanticActionHandler);
    }

    parseUnifiedDiff(input: string): UnifiedDiff[] {
        const lines = input.split('\n');
        const unifiedDiffs: UnifiedDiff[] = [];
        let currentDiff: UnifiedDiff | null = null;
        let insideDiff = false;
        for (const line of lines) {
            if (line.startsWith('--- ')) {
                if (currentDiff) {
                    unifiedDiffs.push(currentDiff);
                }
                currentDiff = {
                    oldFileName: line.substr(4).trim(),
                    newFileName: '',
                    oldFileStart: 0,
                    newFileStart: 0,
                    oldFileLines: 0,
                    newFileLines: 0,
                    changes: [],
                };
                insideDiff = false;
            } else if (line.startsWith('+++ ')) {
                if (currentDiff) {
                    currentDiff.newFileName = line.substr(4).trim();
                }
            } else if (line.startsWith('@@ ')) {
                const match = line.match(/@@ -(\d+),(\d+) \+(\d+),(\d+) @@/);
                if (match && currentDiff) {
                    currentDiff.oldFileStart = parseInt(match[1], 10);
                    currentDiff.oldFileLines = parseInt(match[2], 10);
                    currentDiff.newFileStart = parseInt(match[3], 10);
                    currentDiff.newFileLines = parseInt(match[4], 10);
                }
                insideDiff = true;
            } else if (currentDiff && insideDiff) {
                if (line.startsWith('+') || line.startsWith('-') || line.startsWith(' ')) {
                    currentDiff.changes.push(line);
                } else {
                    insideDiff = false;
                }
            }
        }
        if (currentDiff) {
            unifiedDiffs.push(currentDiff);
        }
        return unifiedDiffs;
    }

    clearInputBuffer() {
        this.inputBuffer = [];
    }
}



### ./src/utils/sps/sps.ts
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as Ohm from 'ohm-js';
import * as fs from 'fs';
import { adhocChatMessage, sendQuery } from '../gpt';

// an action handler for a semantic action
export type SemanticActionHandler = Ohm.ActionDict<unknown>;

// a semantic prompt structure - consists of a prompt, a grammar file, and semantic action handler
export default class SPS {
    protected prompt: string;
    private grammarFile: string;
    private semanticActionHandler: SemanticActionHandler | undefined;
    protected inputBuffer: adhocChatMessage[];
    private _executing: boolean;
    private _interrupted: boolean;
    private _llmOptions: any;
    // prompt and grammar file are required
    constructor(prompt: string, grammarFile: string, llmOptions = {
        model: 'gpt-4',
        temperature: 0.7,
        max_tokens: 2048,
        top_p: 1,
        messages: []
    }) {
        this.prompt = prompt;
        this.grammarFile = grammarFile;
        this.inputBuffer = [];
        this._executing = false;
        this._interrupted = false;
        this._llmOptions = llmOptions;
    }
    // add a message to the input buffer to send to the LLM
    addMessageToInputBuffer(message: adhocChatMessage): void { this.inputBuffer.push(message); }
    interrupt(): void { this._interrupted = true; }
    
    // perform a single iteration of the SPS
    async iterate(semanticActionHandler: SemanticActionHandler): Promise<any> {
        this.semanticActionHandler = semanticActionHandler;
        let response = await sendQuery({
            model: 'gpt-4',
            temperature: 0.8,
            max_tokens: 2048,
            top_p: 0.8,
            messages: [{
                role: 'system',
                content: this.prompt
            }, ...this.inputBuffer.map((message) => ({
                role: message.role,
                content: message.content
            })) as any]
        });
        try {
            response += '\n';
            const { grammar, semantics } = this.loadGrammar(this.grammarFile);
            const ohmParser = semantics.addOperation("toJSON", this.semanticActionHandler);
            const match = grammar.match(response);
            if (!match.failed()) {
                const result = await ohmParser(match).toJSON();
                return result;
            } else { 
                this.addMessageToInputBuffer({
                    role: 'system',
                    content: 'INVALID OUTPUT FORMAT. Please review the instructions and try again.'
                });
                console.log(`invalid output format: ${response}`);
                await this.iterate(semanticActionHandler);
            }
        } catch (e) { 
            await this.iterate(semanticActionHandler);
        }
    }

    // execute the SPS - iterates until explicitly disabled
    async execute(semanticActionHandler: SemanticActionHandler): Promise<any> {
        this._executing = true;
        const _run = async (): Promise<any> => {
            if (!this._executing) { return; }
            const result = await this.iterate(semanticActionHandler);
            if (result && result.stop) { // execution can be stopped by the semantic action handler
                this._executing = false;
                console.log('Execution stopped');
                return result;
            }
            if (this._interrupted) {
                this._executing = false;
                this._interrupted = false;
                return result;
            } 
            return await _run();
        }; 
        return await _run();
    }

    // serialize the SPS to a file
    serializeToFile(filePath: string): void {
        const serializedData = JSON.stringify({
            prompt: this.prompt,
            grammarFile: this.grammarFile,
            inputBuffer: this.inputBuffer,
        });
        fs.writeFileSync(filePath, serializedData);
    }

    // deserialize from file
    static deserializeFromFile(filePath: string): SPS {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const deserializedData = JSON.parse(fileContent);
        const sps = new SPS(
            deserializedData.prompt,
            deserializedData.grammarFile);
        sps.inputBuffer = deserializedData.inputBuffer;
        return sps;
    }

    // load the SPS grammar
    private loadGrammar(grammarFile: string) {
        // Read the grammar file and return an Ohm.js grammar object
        const grammar = Ohm.grammar(grammarFile);
        const semantics = grammar.createSemantics();
        return { grammar, semantics };
    }
}
### ./src/utils/style.ts
import * as vscode from 'vscode';
import * as fs from 'fs';

export function loadStyle(webview: vscode.Webview, extensionUri: vscode.Uri, libName: string) {
    const libPath = vscode.Uri.joinPath(extensionUri, libName);
    const libContent = fs.readFileSync(libPath.fsPath, 'utf8');
    return `<style>
${libContent}
</style>`;
}
### ./src/utils/Command.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as vscode from 'vscode';
import { commands, ExtensionContext } from 'vscode';

// unregister the command
function unregisterCommand(commandId: string): void {
    const commandsList = vscode.commands.getCommands(false);
    commandsList.then((commands) => {
        if (commands.includes(commandId)) {
            vscode.commands.executeCommand('workbench.action.removeCommand', commandId);
        }
    });
}

// execute the command
async function executeCommand(commandId: string, ...args: any[]): Promise<any> {
    try {
        const result = await vscode.commands.executeCommand(commandId, ...args);
        return result;
    } catch (error) {
        console.error(`Error executing command ${commandId}:`, error);
        throw error;
    }
}

export abstract class Command {

    // Constructor
    constructor(public commandId: string, public title: string, public context: ExtensionContext) {
        const commandDisposable = commands.registerCommand(commandId, this.execute, this);
        context.subscriptions.push(commandDisposable);
        this.onDidRegister();
    }

    // To be overridden by subclasses, execute the command logic
    abstract execute(...args: any[]): Promise<void>;

    // Check if the command can be executed in the current context
    isExecutable(): boolean {
        // Default implementation returns true, can be overridden by subclasses
        return true;
    }

    // Called when the command registration with VS Code is completed
    protected onDidRegister(): void {
        // Default implementation is empty, can be overridden by subclasses
    }

    // Called before the command is unregistered from VS Code
    protected async onWillUnregister(): Promise<void> {
        // Default implementation is empty, can be overridden by subclasses
    }

    // Get the command ID
    getId(): string {
        return this.commandId;
    }

    // Get the command's VS Code Extension Context
    getCommandContext(): ExtensionContext {
        return this.context;
    }

    // Register the command with VS Code
    static async register<T extends Command>(this: new (context: ExtensionContext) => T, context: ExtensionContext): Promise<T> {
        const command = new this(context);
        return command;
    }

    // Unregister the command from VS Code
    static async unregister(command: Command): Promise<void> {
        await command.onWillUnregister();
        command.getCommandContext().subscriptions.forEach((subscription) => {
            subscription.dispose();
        });
        unregisterCommand(command.getId());
    }

    // Execute the command
    static async execute(commandId: string, ...args: any[]): Promise<any> {
        return executeCommand(commandId, ...args);
    }
}### ./src/utils/outputLog.ts
/* eslint-disable @typescript-eslint/no-unused-vars */
import * as vscode from 'vscode';

// This method is called when your extension is activated
export function activate(_context: vscode.ExtensionContext) {
    log('Puck Bug Zapper');
}

export function deactivate() {
    // nothing to do
}

// log a message to the output channel
let outputChannel: vscode.OutputChannel;

export function log(message: string, showChannel = false) {
    if(!outputChannel) { outputChannel = vscode.window.createOutputChannel('Puck Bug Zapper'); }
    outputChannel.appendLine(message);
    if(showChannel) { outputChannel.show(); }
}### ./src/gpt4Service.ts
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
}### ./src/constants.ts
// constants.ts

const SUPPORTED_EXTENSIONS = ['.ts', '.tsx'];

const COMMANDS = {
    fixNow: 'puck.problemSolver.fixNow',
    startAgents: 'puck.problemSolver.startAgents',
    stopAgents: 'puck.problemSolver.stopAgents',
};

const BUG_ZAPPER_JSON_FILENAME = 'bug-zapper.json';

export { SUPPORTED_EXTENSIONS, COMMANDS, BUG_ZAPPER_JSON_FILENAME };### ./src/utility.ts
// utility.ts

import * as Diff from 'diff';

export function applyDiffPatch(originalCode: string, diffPatch: string): string {
  const diff = Diff.parsePatch(diffPatch);
  const updatedCode = Diff.applyPatch(originalCode, diff as any);
  return updatedCode;
}### ./src/commands/SetOpenAIKeyCommand.ts
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-case-declarations */
/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from "vscode";
import { Command } from "../utils/Command";

const org = "puck.adhocChat";

export default class SetOpenAIKeyCommand extends Command {
    constructor(commandId: string, title: string, context: vscode.ExtensionContext) {
        super(`${org}.${commandId}`, title, context);
    }

    async execute() {
        const apiKey = await vscode.window.showInputBox({
            prompt: 'Enter your OpenAI API key',
            ignoreFocusOut: true,
            password: true,
        });
        if (apiKey) {
            setOpenAIKey(apiKey);
            vscode.window.showInformationMessage('OpenAI API key saved successfully');
        } else {
            vscode.window.showErrorMessage('Invalid API key. Please try again');
        }
    }
}

export function getOpenAIKey(): string {
    const config = vscode.workspace.getConfiguration(org);
    return config.get('apikey') || '';
}

async function setOpenAIKey(openAIKey: string): Promise<void> {
    try {
        await vscode.workspace.getConfiguration(org).update('apikey', openAIKey, vscode.ConfigurationTarget.Global);
        const config = vscode.workspace.getConfiguration(org);
        if (config.has('apikey')) {
            vscode.window.showInformationMessage('OpenAI API key saved successfully');
        } else {
            vscode.window.showErrorMessage('Failed to save OpenAI API key');
        }
    } catch (error: any) {
        vscode.window.showErrorMessage(`Error updating configuration: ${error.message}`);
    }
}### ./src/commands/index.ts
import * as vscode from "vscode";

import SetOpenAIKeyCommand from "./SetOpenAIKeyCommand";

export function activate(context: vscode.ExtensionContext) {

    new SetOpenAIKeyCommand("setOpenAIKey", "Set OpenAI Key", context);
}


export function deactivate() { }### ./src/autonomousMode.ts
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
}## Summary of the VS Code Extension

class UserActivityMonitor {
function applyFix
export async function fixSelectedProblem
export function activate
export function deactivate
export function getExtensionContext
interface ProblemSolverData {
export class WorkspaceConfiguration {
class ProblemSolverPanel {
export function revealProblemSolverPanel
export interface adhocChatMessage {
export interface adhocChatConversation {
export interface MessageHistoryItem {
function saveMessages
export function loadMessages
export async function sendQuery
export async function sendChatQuery
export async function streamQuery
export async function sendQueryWithRequeries
export function loadScript
export function formatMultilineBash
// all commands are a subclass of Command
export default class ProblemSolverSPS extends SPS {
BashCommanderMessage: async function
Title: function
Delimiters: function
Finish: function
Error: function
TargetFile: function
Dependency: function
Diff: function
FileRequest: function
Announce: function
const recs = children.map
export default class SPS {
export function loadStyle
function unregisterCommand
async function executeCommand
export abstract class Command {
// To be overridden by subclasses, execute the command logic
// Default implementation returns true, can be overridden by subclasses
// Default implementation is empty, can be overridden by subclasses
// Default implementation is empty, can be overridden by subclasses
export function activate
export function deactivate
export function log
interface GPT4RequestPayload {
// class is responsible for managing GPT-4 fix requests. It ensures that duplicate requests are not sent to GPT-4
// and also enables a means to cancel a request if it is taking too long. The class will also return alist of
class GPT4FixManager {
export async function requestGPT4Fix
export function applyDiffPatch
export default class SetOpenAIKeyCommand extends Command {
export function getOpenAIKey
async function setOpenAIKey
export function activate
export function deactivate
export function startStopAgents
async function runAutonomousMode
function delay
class UserActivityMonitor {
function applyFix
export async function fixSelectedProblem
export function activate
export function deactivate
export function getExtensionContext
interface ProblemSolverData {
export class WorkspaceConfiguration {
class ProblemSolverPanel {
export function revealProblemSolverPanel
export interface adhocChatMessage {
export interface adhocChatConversation {
export interface MessageHistoryItem {
function saveMessages
export function loadMessages
export async function sendQuery
export async function sendChatQuery
export async function streamQuery
export async function sendQueryWithRequeries
export function loadScript
export function formatMultilineBash
// all commands are a subclass of Command
export default class ProblemSolverSPS extends SPS {
BashCommanderMessage: async function
Title: function
Delimiters: function
Finish: function
Error: function
TargetFile: function
Dependency: function
Diff: function
FileRequest: function
Announce: function
const recs = children.map
export default class SPS {
export function loadStyle
function unregisterCommand
async function executeCommand
export abstract class Command {
// To be overridden by subclasses, execute the command logic
// Default implementation returns true, can be overridden by subclasses
// Default implementation is empty, can be overridden by subclasses
// Default implementation is empty, can be overridden by subclasses
export function activate
export function deactivate
export function log
interface GPT4RequestPayload {
// class is responsible for managing GPT-4 fix requests. It ensures that duplicate requests are not sent to GPT-4
// and also enables a means to cancel a request if it is taking too long. The class will also return alist of
class GPT4FixManager {
export async function requestGPT4Fix
export function applyDiffPatch
export default class SetOpenAIKeyCommand extends Command {
export function getOpenAIKey
async function setOpenAIKey
export function activate
export function deactivate
export function startStopAgents
async function runAutonomousMode
function delay
