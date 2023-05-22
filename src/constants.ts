// constants.ts

const SUPPORTED_EXTENSIONS = ['.ts', '.tsx'];

const COMMANDS = {
    fixNow: 'puck.problemSolver.fixNow',
    startAgents: 'puck.problemSolver.startAgents',
    stopAgents: 'puck.problemSolver.stopAgents',
    showProblemSolver: 'puck.problemSolver.showProblemSolver',
};

const BUG_ZAPPER_JSON_FILENAME = 'bug-zapper.json';

export { SUPPORTED_EXTENSIONS, COMMANDS, BUG_ZAPPER_JSON_FILENAME };