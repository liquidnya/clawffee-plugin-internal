//@ts-check
//const { functionNames, functionFileNames, functionOverrides, functionDirectives, fileInfo } = require('#globals').commandGlobals;
//const verbose = require('#globals')

const acorn = require("acorn");
const acorn_walk = require("acorn-walk");
//const { createSourceMap } = require("./SourceMaps/SourceMapSys");
//const prettyPrepareStack = require('../clawffeeInternals').prettyPrepareStack;

for (const t of Object.entries(acorn_walk.base)) {
    console.log(t[0]);
}

/**
 * @typedef {acorn.AnyNode|acorn_walk.AggregateType[keyof acorn_walk.AggregateType]} AnyNode
 */
/**
 * @typedef {(template: readonly string[], ...substitutions:TransformedResult[]) => TransformedCode} TransformerTemplate
 */

/**
 * @template T
 * @typedef {(node: T, code: TransformerTemplate) => TransformedResult} TransformerCallback
 */

/**
 * @typedef {{[type in acorn.AnyNode["type"]]?:TransformerCallback<Extract<acorn.AnyNode,{type:type}>>}} AnyNodeTransformerFunctions
 */

/**
 * @typedef {{[type in keyof acorn_walk.AggregateType]?:TransformerCallback<acorn_walk.AggregateType[type]>}} AggregateTransformerFunctions
 */

/**
 * @typedef {AnyNodeTransformerFunctions & AggregateTransformerFunctions} TransformerFunctions
 */

/**
 * @typedef {keyof TransformerFunctions} NodeType
 */

/**
 * @type {TransformerCallback<acorn.AnyNode>}
 */
const defaultFunction = (node, code) => {
    return code`${node}`;
};
const base = Object.fromEntries(
    Object.keys(acorn_walk.base)
        .map(key => ([key, defaultFunction]))
);

/**
 * @typedef {acorn.AnyNode|TransformedCode|null} TransformedResult
 */

/**
 * @typedef CodeSize
 * @property {number} lines
 * @property {number} lastLineColumns
 */

/**
 * @typedef TransformedCode
 * @property {string} code
 * @property {CodeSize} [codeSize]
 * @property {(position: acorn.Position) => acorn.SourceLocation | null} loc
 */

/**
 * @typedef {bigint|BigInt|boolean|number|string|undefined|null|{[property: string]: LiteralValue}|LiteralArray|LiteralMap} LiteralValue
 */
/**
 * @typedef {LiteralValue[]} LiteralArray
 */
/**
 * @typedef {Map<LiteralValue, LiteralValue>} LiteralMap
 */
/**
 * @typedef {Set<LiteralSet>} LiteralSet
 */

/**
 * @param {LiteralValue} value 
 * @returns {string}
 */
function literalValue(value) {
    if (value === null) {
        return "null";
    } else if (Array.isArray(value)) {
        return `[${value.map(literalValue).join(",")}]`;
    }
    switch (typeof value) {
        case "undefined":
            return "undefined";
        case "bigint":
            return `${value.toString()}n`;
        case "boolean":
        case "number":
        case "string":
            return JSON.stringify(value);
        case "object":
            if (value instanceof Set) {
                return `new Set(${literalValue([...value])})`;
            } else if (value instanceof Map) {
                return `new Map(${literalValue([...value.entries()])})`;
            }
            return `{${Object.entries(value).map((k, v) => `${literalValue(k)}:${literalValue(v)}`).join(",")}}`;
        case "function":
        case "symbol":
            throw Error(`${typeof value} is not supported as a literal`);
        
    }
}

/**
 * 
 * @param {Function|undefined} [constructorOp] 
 * @returns {TransformedCode["loc"]}
 */
function callSiteLocFunction(constructorOp) {
    const { prepareStackTrace, stackTraceLimit } = Error;
    try {
        /** @type {acorn.SourceLocation | null} */
        let result = null;
        Error.prepareStackTrace = (_err, stackTraces) => {
            try {
                const [callSite] = stackTraces;
                if (callSite !== undefined) {
                    /** @type {acorn.Position} */
                    const pos = {
                        line: callSite.getLineNumber() ?? 1,
                        column: callSite.getColumnNumber() ?? 0,
                    };
                    result = {
                        start: pos,
                        end: pos,
                        source: callSite.getFileName(),
                    };
                }
            } catch {
                // ignore error
            }
        };
        Error.stackTraceLimit = 1;
        Error.captureStackTrace({}, constructorOp);
        return () => result;
    } finally {
        Error.prepareStackTrace = prepareStackTrace;
        Error.stackTraceLimit = stackTraceLimit;
    }
}

/**
 * @param {LiteralValue} value 
 * @returns {TransformedCode}
 */
function literal(value) {
    const loc = callSiteLocFunction(literal);
    return {
        code: literalValue(value),
        loc,
    };
}

function codeMerger() {
    /** @type {({ codeSize: CodeSize, loc: TransformedCode["loc"] })[]} */
    const locations = [];
    let lines = 1;
    let lastLineColumns = 0;
    let code = "";
    /** 
     * @param {TransformedCode["loc"]} loc
     * @param {CodeSize} codeSize
     */
    const addLocation = (loc, codeSize) => {
        const addLines = codeSize.lines - 1;
        if (addLines === 0) {
            lastLineColumns += codeSize.lastLineColumns;
        } else {
            lines += addLines;
            lastLineColumns = codeSize.lastLineColumns;
        }
        locations.push({
            codeSize: {
                lines,
                lastLineColumns,
            },
            loc
        });
    };
    return {
        /**
         * @param {TransformedCode[]} codeSnippets 
         */
        add(...codeSnippets) {
            for (const codeSnippet of codeSnippets) {
                if (codeSnippet.code.length !== 0) {
                    code += codeSnippet.code;
                    if (codeSnippet.codeSize !== undefined) {
                        addLocation(codeSnippet.loc, codeSnippet.codeSize);
                    } else {
                        const lines = codeSnippet.code.split("\n");
                        addLocation(codeSnippet.loc, {
                            lines: lines.length,
                            lastLineColumns: lines[lines.length - 1].length,
                        });
                    }
                }
            }
            return this;
        },
        /**
         * 
         * @param {acorn.Position} position 
         */
        loc(position) {
            // TODO: use binary search instead
            
            return null;
        },
        /**
         * @returns {TransformedCode}
         */
        build() {
            return {
                code,
                codeSize: {
                    lines,
                    lastLineColumns,
                },
                loc: this.loc.bind(this)
            };
        }
    };
}

/**
 * @template T
 * @param {(node: acorn.AnyNode, override?: NodeType | undefined) => (code: TransformerTemplate) => TransformedResult} callbacks 
 */
function createTransformer(callbacks) {
    /** @type {(tranformNode: (node: acorn.AnyNode) => TransformedCode) => TransformerTemplate} */
    const createCode = (tranformNode) => (template, ...substitutions) => {
        const loc = callSiteLocFunction(literal);
        /** @type {TransformedCode[]} */
        const codeSnippets = [];
        for (let i = 0; i < Math.max(template.length * 2 - 1, substitutions.length * 2 + 1); i++) {
            const isSubstitution = i & 1;
            const index = i >> 1;
            if (isSubstitution) {
                // substitution
                if (index < substitutions.length) {
                    const substitution = substitutions[index];
                    if (substitution !== null) {
                        if ("code" in substitution) {
                            codeSnippets.push(substitution);
                        } else {
                            codeSnippets.push(tranformNode(substitution));
                        }
                    }
                }
            } else {
                // template
                if (index < template.length) {
                    const code = template[index];
                    if (code !== "") {
                        codeSnippets.push({
                            code: template[index],
                            loc,
                        });
                    }
                }
            }
        }
        return codeMerger().add(...codeSnippets).build();
    };

    /**
     * @param {AnyNode} node 
     * @param {string} [override]
     * @returns {TransformedCode}
     */
    function walkNode(node, override) {
        return codeMerger().build();
    }

    /**
     * @param {acorn.AnyNode} node 
     * @param {NodeType} [override]
     * @returns {TransformedCode}
     */
    function transformNode(node, override) {
        const fn = callbacks(node, override);
        const code = createCode(n => n === node ? walkNode(node, override) : transformNode(n));
        return code`${fn(code)}`;
    }

    return transformNode;
}

/**
 * 
 * @param {string} input 
 * @param {string} sourceFile 
 * @param {TransformerFunctions} functions
 * @returns {TransformedCode}
 */
function transformCode(input, sourceFile, functions) {
    /**
     * @type {(node: acorn.AnyNode, override?: NodeType | undefined) => (code: TransformerTemplate) => TransformedResult}
     */
    const callbacks = (node, override) => {
        // FIXME: this is broken!
        const fn = functions[node.type];
        if (fn === undefined) {
            // walkNode
            return () => node;
        }
        return (code) => functions[node.type]?.(node, code) ?? node;
    };
    const transformNode = createTransformer(callbacks);
    const node = acorn.parse(input, {
        locations: true,
        ecmaVersion: "latest",
        sourceType: "module",
        ranges: true,
        sourceFile,
    });
    return transformNode(node);
}

// acorn_walk.simple(parsedCode, {
//         WhileStatement: whileWrapper,
//         DoWhileStatement: whileWrapper,
//         ForStatement: whileWrapper,
//         ForInStatement: whileWrapper,
//         ForOfStatement: whileWrapper,
//         FunctionDeclaration: funtionWrapper,
//         Property: propertyWrapper,
//         FunctionExpression: funtionWrapper,
//         ArrowFunctionExpression: funtionWrapper,
//     });