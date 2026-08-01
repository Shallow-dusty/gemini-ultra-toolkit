const buildApi = require('./build_core');
const path = require('node:path');

function buildOptionsFromEnvironment(environment) {
    return {
        rootDir: environment.PRIMER_PP_BUILD_ROOT,
        userscriptOutputDir: environment.PRIMER_PP_USERSCRIPT_OUTPUT_DIR,
        extensionOutputDir: environment.PRIMER_PP_EXTENSION_OUTPUT_DIR,
    };
}

function formatArtifactReport(report) {
    const rawBudget = report.budgetBytes === null ? 'disabled' : `${report.budgetBytes} B`;
    const gzipBudget = report.gzipBudgetBytes === null ? 'disabled' : `${report.gzipBudgetBytes} B`;
    const mode = report.minified ? 'minified' : 'unminified';
    return `${report.rawBytes} B raw; ${report.gzipBytes} B gzip-9; SHA-256 ${report.sha256}; `
        + `budgets raw ${rawBudget}, gzip-9 ${gzipBudget}; ${mode}`;
}

function logArtifact(log, label, destination, report) {
    log(`✓ ${label}: ${destination} (${formatArtifactReport(report)})`);
}

function runBuild(target, options, api = buildApi, log = console.log) {
    if (target === 'all') {
        const result = api.buildAll(options);
        logArtifact(log, 'Userscript', result.userscript.outputFile, result.userscript.artifact);
        logArtifact(
            log,
            'Extension content.js',
            path.join(result.extension.outputDir, 'content.js'),
            result.extension.artifact,
        );
        return result;
    }
    if (target === 'userscript') {
        const result = api.buildUserscript({
            ...options,
            outputDir: options.userscriptOutputDir,
        });
        logArtifact(log, 'Userscript', result.outputFile, result.artifact);
        return result;
    }
    if (target === 'extension') {
        const result = api.buildExtension({
            ...options,
            outputDir: options.extensionOutputDir,
        });
        logArtifact(log, 'Extension content.js', path.join(result.outputDir, 'content.js'), result.artifact);
        return result;
    }
    throw new Error(`Unsupported TARGET: ${target}`);
}

function main(environment = process.env) {
    const target = environment.TARGET || 'all';
    try {
        return runBuild(target, buildOptionsFromEnvironment(environment));
    } catch (error) {
        console.error(`Build failed: ${error.message}`);
        process.exitCode = 1;
        return null;
    }
}

// The npm platform-specific entry points load this file through `node -e`.
// In that mode Node leaves `require.main` undefined, so preserve the original
// executable-on-require contract while keeping ordinary test imports inert.
if (require.main === module || require.main === undefined) main();

module.exports = {
    buildOptionsFromEnvironment,
    formatArtifactReport,
    logArtifact,
    main,
    runBuild,
};
