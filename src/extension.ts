import * as vscode from 'vscode';
import { COMMANDS } from './constants';
import { revealProblemSolverPanel } from './webViewPanel';
import { fixSelectedProblem } from './fixSelectedProblem';
import { startStopAgents } from './autonomousMode';
import * as Log from "./utils/outputLog";
import * as SetOpenAIKeyCommand from "./commands/SetOpenAIKeyCommand";

let extensionContext: vscode.ExtensionContext;

export function activate(context: vscode.ExtensionContext) {
	console.log('Puck Bug Zapper extension is now active!');

	extensionContext = context;

	Log.activate(context);
	new SetOpenAIKeyCommand.default('setOpenAIKey', 'Set OpenAI API Key', context);

	// fix the currently selected problem
	const fixNowDisposable = vscode.commands.registerCommand(COMMANDS.fixNow, () => {
		revealProblemSolverPanel();
		fixSelectedProblem();
	});

	// start the agent in autonomous mode
	const startAgentsDisposable = vscode.commands.registerCommand(COMMANDS.startAgents, () => {
		startStopAgents();
	});

	// show the bug zapper panel
	const showProblemSolverPanelDisposable = vscode.commands.registerCommand(COMMANDS.showProblemSolver, () => {
		revealProblemSolverPanel();
	});

	// push the disposables to the context so they can be cleaned up on deactivation
	context.subscriptions.push(
		fixNowDisposable, 
		startAgentsDisposable, 
		showProblemSolverPanelDisposable
	);


}

export function deactivate() {}

export function getExtensionContext(): vscode.ExtensionContext {
	return extensionContext;
}