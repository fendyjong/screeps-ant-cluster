var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var Log_1;
import { profile } from '../profiler/decorator';
import { color } from '../utilities/utils';
export var LogLevels;
(function (LogLevels) {
    LogLevels[LogLevels["ERROR"] = 0] = "ERROR";
    LogLevels[LogLevels["WARNING"] = 1] = "WARNING";
    LogLevels[LogLevels["ALERT"] = 2] = "ALERT";
    LogLevels[LogLevels["INFO"] = 3] = "INFO";
    LogLevels[LogLevels["DEBUG"] = 4] = "DEBUG"; // log.level = 4
})(LogLevels || (LogLevels = {}));
/**
 * Default debug level for log output
 */
export const LOG_LEVEL = LogLevels.INFO;
/**
 * Prepend log output with current tick number.
 */
export const LOG_PRINT_TICK = true;
/**
 * Prepend log output with source line.
 */
export const LOG_PRINT_LINES = false;
/**
 * Load source maps and resolve source lines back to typeascript.
 */
export const LOG_LOAD_SOURCE_MAP = false;
/**
 * Maximum padding for source links (for aligning log output).
 */
export const LOG_MAX_PAD = 100;
/**
 * VSC location, used to create links back to source.
 * Repo and revision are filled in at build time for git repositories.
 */
export const LOG_VSC = { repo: '@@_repo_@@', revision: '@@_revision_@@', valid: false };
// export const LOG_VSC = { repo: "@@_repo_@@", revision: __REVISION__, valid: false };
/**
 * URL template for VSC links, this one works for github and gitlab.
 */
export const LOG_VSC_URL_TEMPLATE = (path, line) => {
    return `${LOG_VSC.repo}/blob/${LOG_VSC.revision}/${path}#${line}`;
};
// <caller> (<source>:<line>:<column>)
const stackLineRe = /([^ ]*) \(([^:]*):([0-9]*):([0-9]*)\)/;
const FATAL = -1;
const fatalColor = '#d65156';
export function resolve(fileLine) {
    const split = _.trim(fileLine).match(stackLineRe);
    if (!split || !Log.sourceMap) {
        return { compiled: fileLine, final: fileLine };
    }
    const pos = { column: parseInt(split[4], 10), line: parseInt(split[3], 10) };
    const original = Log.sourceMap.originalPositionFor(pos);
    const line = `${split[1]} (${original.source}:${original.line})`;
    const out = {
        caller: split[1],
        compiled: fileLine,
        final: line,
        line: original.line,
        original: line,
        path: original.source,
    };
    return out;
}
function makeVSCLink(pos) {
    if (!LOG_VSC.valid || !pos.caller || !pos.path || !pos.line || !pos.original) {
        return pos.final;
    }
    return link(vscUrl(pos.path, `L${pos.line.toString()}`), pos.original);
}
function tooltip(str, tooltip) {
    return `<abbr title='${tooltip}'>${str}</abbr>`;
}
function vscUrl(path, line) {
    return LOG_VSC_URL_TEMPLATE(path, line);
}
function link(href, title) {
    return `<a href='${href}' target="_blank">${title}</a>`;
}
function time() {
    return color(Game.time.toString(), 'gray');
}
export function debug(thing, ...args) {
    if (thing.memory && thing.memory.debug) {
        this.debug(`${thing.name} @ ${thing.pos.print}: `, args);
    }
}
/**
 * Log provides methods for displaying pretty-printed text into the Screeps console
 */
let Log = Log_1 = class Log {
    constructor() {
        this._maxFileString = 0;
        _.defaultsDeep(Memory, {
            settings: {
                log: {
                    level: LOG_LEVEL,
                    showSource: LOG_PRINT_LINES,
                    showTick: LOG_PRINT_TICK,
                }
            }
        });
    }
    static loadSourceMap() {
        // try {
        // 	// tslint:disable-next-line
        // 	const map = require('main.js.map');
        // 	if (map) {
        // 		Log.sourceMap = new SourceMapConsumer(map);
        // 	}
        // } catch (err) {
        console.log('Source mapping deprecated.');
        // }
    }
    get level() {
        return Memory.settings.log.level;
    }
    setLogLevel(value) {
        let changeValue = true;
        switch (value) {
            case LogLevels.ERROR:
                console.log(`Logging level set to ${value}. Displaying: ERROR.`);
                break;
            case LogLevels.WARNING:
                console.log(`Logging level set to ${value}. Displaying: ERROR, WARNING.`);
                break;
            case LogLevels.ALERT:
                console.log(`Logging level set to ${value}. Displaying: ERROR, WARNING, ALERT.`);
                break;
            case LogLevels.INFO:
                console.log(`Logging level set to ${value}. Displaying: ERROR, WARNING, ALERT, INFO.`);
                break;
            case LogLevels.DEBUG:
                console.log(`Logging level set to ${value}. Displaying: ERROR, WARNING, ALERT, INFO, DEBUG.`);
                break;
            default:
                console.log(`Invalid input: ${value}. Loging level can be set to integers between `
                    + LogLevels.ERROR + ' and ' + LogLevels.DEBUG + ', inclusive.');
                changeValue = false;
                break;
        }
        if (changeValue) {
            Memory.settings.log.level = value;
        }
    }
    get showSource() {
        return Memory.settings.log.showSource;
    }
    set showSource(value) {
        Memory.settings.log.showSource = value;
    }
    get showTick() {
        return Memory.settings.log.showTick;
    }
    set showTick(value) {
        Memory.settings.log.showTick = value;
    }
    trace(error) {
        if (this.level >= LogLevels.ERROR && error.stack) {
            console.log(this.resolveStack(error.stack));
        }
        return this;
    }
    throw(e) {
        console.log.apply(this, this.buildArguments(FATAL).concat([color(e.toString(), fatalColor)]));
    }
    error(...args) {
        if (this.level >= LogLevels.ERROR) {
            console.log.apply(this, this.buildArguments(LogLevels.ERROR).concat([].slice.call(args)));
        }
        return undefined;
    }
    warning(...args) {
        if (this.level >= LogLevels.WARNING) {
            console.log.apply(this, this.buildArguments(LogLevels.WARNING).concat([].slice.call(args)));
        }
        return undefined;
    }
    alert(...args) {
        if (this.level >= LogLevels.ALERT) {
            console.log.apply(this, this.buildArguments(LogLevels.ALERT).concat([].slice.call(args)));
        }
        return undefined;
    }
    notify(message) {
        this.alert(message);
        Game.notify(message);
        return undefined;
    }
    info(...args) {
        if (this.level >= LogLevels.INFO) {
            console.log.apply(this, this.buildArguments(LogLevels.INFO).concat([].slice.call(args)));
        }
        return undefined;
    }
    debug(...args) {
        if (this.level >= LogLevels.DEBUG) {
            console.log.apply(this, this.buildArguments(LogLevels.DEBUG).concat([].slice.call(args)));
        }
    }
    debugCreep(creep, ...args) {
        if (creep.memory && creep.memory.debug) {
            this.debug(`${creep.name} @ ${creep.pos.print}: `, args);
        }
    }
    printObject(obj) {
        console.log.apply(this, this.buildArguments(LogLevels.DEBUG).concat(JSON.stringify(obj)));
    }
    getFileLine(upStack = 4) {
        const stack = new Error('').stack;
        if (stack) {
            const lines = stack.split('\n');
            if (lines.length > upStack) {
                const originalLines = _.drop(lines, upStack).map(resolve);
                const hoverText = _.map(originalLines, 'final').join('&#10;');
                return this.adjustFileLine(originalLines[0].final, tooltip(makeVSCLink(originalLines[0]), hoverText));
            }
        }
        return '';
    }
    buildArguments(level) {
        const out = [];
        switch (level) {
            case LogLevels.ERROR:
                out.push(color('ERROR  ', 'red'));
                break;
            case LogLevels.WARNING:
                out.push(color('WARNING', 'orange'));
                break;
            case LogLevels.ALERT:
                out.push(color('ALERT  ', 'yellow'));
                break;
            case LogLevels.INFO:
                out.push(color('INFO   ', 'green'));
                break;
            case LogLevels.DEBUG:
                out.push(color('DEBUG  ', 'gray'));
                break;
            case FATAL:
                out.push(color('FATAL  ', fatalColor));
                break;
            default:
                break;
        }
        if (this.showTick) {
            out.push(time());
        }
        if (this.showSource && level <= LogLevels.ERROR) {
            out.push(this.getFileLine());
        }
        return out;
    }
    resolveStack(stack) {
        if (!Log_1.sourceMap) {
            return stack;
        }
        return _.map(stack.split('\n').map(resolve), 'final').join('\n');
    }
    adjustFileLine(visibleText, line) {
        const newPad = Math.max(visibleText.length, this._maxFileString);
        this._maxFileString = Math.min(newPad, LOG_MAX_PAD);
        return `|${_.padRight(line, line.length + this._maxFileString - visibleText.length, ' ')}|`;
    }
};
Log = Log_1 = __decorate([
    profile
], Log);
export { Log };
if (LOG_LOAD_SOURCE_MAP) {
    Log.loadSourceMap();
}
export const log = new Log();
