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



