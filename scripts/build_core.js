const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { gzipSync } = require('node:zlib');
const { buildSync } = require('esbuild');

const DEFAULT_ROOT = path.join(__dirname, '..');
const USERSCRIPT_FILENAME = 'primer-pp.user.js';
const STAGE_PREFIX = '.primer-pp-stage-';
const BACKUP_PREFIX = '.primer-pp-backup-';
// These are unpacked JavaScript and deterministic gzip-9 regression budgets,
// not extension-store ZIP limits. The v13 baseline is 819,666/821,956 raw B
// and 240,000/240,772 gzip-9 B (userscript/extension), leaving about 1.6-1.8%.
const DEFAULT_ARTIFACT_SIZE_BUDGETS = Object.freeze({
    extensionContentGzipBytes: 245_000,
    extensionContentRawBytes: 835_000,
    userscriptGzipBytes: 245_000,
    userscriptRawBytes: 835_000,
});

function readText(fsImpl, file) {
    return fsImpl.readFileSync(file, 'utf8');
}

function outputText(result, label) {
    if (!result || (result.errors && result.errors.length > 0)) {
        throw new Error(`${label} bundle reported errors`);
    }
    if (!result.outputFiles || result.outputFiles.length !== 1) {
        throw new Error(`${label} bundle did not produce exactly one output file`);
    }
    return Buffer.from(result.outputFiles[0].contents).toString('utf8');
}

function normalizeSizeBudget(value, fallback, name) {
    const resolved = value === undefined ? fallback : value;
    if (!Number.isSafeInteger(resolved) || resolved <= 0) {
        throw new TypeError(`${name} must be a positive integer byte count`);
    }
    return resolved;
}

function resolveSizeBudgets(value) {
    if (value === false) {
        return {
            extensionContentGzipBytes: null,
            extensionContentRawBytes: null,
            userscriptGzipBytes: null,
            userscriptRawBytes: null,
        };
    }
    if (value !== undefined && (!value || typeof value !== 'object' || Array.isArray(value))) {
        throw new TypeError('sizeBudgets must be an object or false');
    }
    const overrides = value || {};
    return {
        extensionContentGzipBytes: normalizeSizeBudget(
            overrides.extensionContentGzipBytes,
            DEFAULT_ARTIFACT_SIZE_BUDGETS.extensionContentGzipBytes,
            'extensionContentGzipBytes',
        ),
        extensionContentRawBytes: normalizeSizeBudget(
            overrides.extensionContentRawBytes,
            DEFAULT_ARTIFACT_SIZE_BUDGETS.extensionContentRawBytes,
            'extensionContentRawBytes',
        ),
        userscriptGzipBytes: normalizeSizeBudget(
            overrides.userscriptGzipBytes,
            DEFAULT_ARTIFACT_SIZE_BUDGETS.userscriptGzipBytes,
            'userscriptGzipBytes',
        ),
        userscriptRawBytes: normalizeSizeBudget(
            overrides.userscriptRawBytes,
            DEFAULT_ARTIFACT_SIZE_BUDGETS.userscriptRawBytes,
            'userscriptRawBytes',
        ),
    };
}

function createArtifactReport(file, options = {}) {
    const fsImpl = options.fsImpl || fs;
    const bytes = Buffer.from(fsImpl.readFileSync(file));
    const budgetBytes = options.budgetBytes ?? null;
    const gzipBudgetBytes = options.gzipBudgetBytes ?? null;
    const report = Object.freeze({
        budgetBytes,
        file: options.file || path.basename(file),
        gzipBudgetBytes,
        gzipBytes: gzipSync(bytes, { level: 9 }).length,
        minified: options.minified === true,
        rawBytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
    });
    if (budgetBytes !== null && report.rawBytes > budgetBytes) {
        throw new Error(
            `${options.label || report.file} raw artifact is ${report.rawBytes} bytes, `
            + `exceeding the ${budgetBytes}-byte budget`,
        );
    }
    if (gzipBudgetBytes !== null && report.gzipBytes > gzipBudgetBytes) {
        throw new Error(
            `${options.label || report.file} gzip-9 artifact is ${report.gzipBytes} bytes, `
            + `exceeding the ${gzipBudgetBytes}-byte budget`,
        );
    }
    return report;
}

function bundlePolicy(minify) {
    return {
        // Production code uses explicit public diagnostic names and does not
        // reflect on Function/Class.name. Unminified builds retain source names
        // naturally, so keepNames would only add redundant runtime helpers.
        keepNames: false,
        legalComments: 'none',
        minify,
        treeShaking: true,
    };
}

function createBundleOptions(entryPoint, minify, extra = {}) {
    return {
        entryPoints: [entryPoint],
        bundle: true,
        format: 'iife',
        write: false,
        target: 'es2020',
        charset: 'utf8',
        logLevel: 'silent',
        ...bundlePolicy(minify),
        ...extra,
    };
}

function extractMetadataVersion(metadata) {
    const match = metadata.match(/^\s*\/\/\s*@version\s+([^\s]+)\s*$/m);
    if (!match) throw new Error('Userscript metadata is missing @version');
    return match[1];
}

function readSourceContract(rootDir, fsImpl = fs) {
    const metadataFile = path.join(rootDir, 'src', 'meta.txt');
    const manifestFile = path.join(rootDir, 'src', 'platforms', 'extension', 'manifest.json');
    const metadata = readText(fsImpl, metadataFile);
    const metadataVersion = extractMetadataVersion(metadata);

    let manifest;
    try {
        manifest = JSON.parse(readText(fsImpl, manifestFile));
    } catch (error) {
        throw new Error(`Invalid extension manifest: ${error.message}`);
    }

    if (manifest.version !== metadataVersion) {
        throw new Error(
            `Version mismatch: userscript is ${metadataVersion}, extension is ${manifest.version || 'missing'}`,
        );
    }

    return { manifest, metadata, version: metadataVersion };
}

function createStagedArtifact(destination, type, fsImpl) {
    const parent = path.dirname(destination);
    fsImpl.mkdirSync(parent, { recursive: true });
    const workspace = fsImpl.mkdtempSync(path.join(parent, STAGE_PREFIX));
    const stagedPath = path.join(workspace, type === 'directory' ? 'payload' : path.basename(destination));
    if (type === 'directory') fsImpl.mkdirSync(stagedPath, { recursive: true });
    return { destination, stagedPath, type, workspace };
}

function removePath(target, fsImpl) {
    if (fsImpl.existsSync(target)) {
        fsImpl.rmSync(target, { force: true, recursive: true });
    }
}

function copyPath(source, destination, fsImpl) {
    if (fsImpl.statSync(source).isDirectory()) {
        fsImpl.cpSync(source, destination, { errorOnExist: true, recursive: true });
    } else {
        fsImpl.copyFileSync(source, destination);
    }
}

function movePath(source, destination, fsImpl) {
    try {
        fsImpl.renameSync(source, destination);
        return 'rename';
    } catch (error) {
        if (error?.code !== 'EXDEV') throw error;
    }

    try {
        copyPath(source, destination, fsImpl);
        removePath(source, fsImpl);
        return 'copy';
    } catch (error) {
        try {
            removePath(destination, fsImpl);
        } catch (cleanupError) {
            error.cleanupError = cleanupError;
        }
        throw error;
    }
}

function cleanupArtifacts(artifacts, fsImpl) {
    for (const artifact of artifacts) removePath(artifact.workspace, fsImpl);
}

function createBackup(destination, fsImpl) {
    if (!fsImpl.existsSync(destination)) return null;
    const workspace = fsImpl.mkdtempSync(path.join(path.dirname(destination), BACKUP_PREFIX));
    const backupPath = path.join(workspace, 'previous');
    try {
        movePath(destination, backupPath, fsImpl);
        return { backupPath, workspace };
    } catch (error) {
        removePath(workspace, fsImpl);
        throw error;
    }
}

function commitArtifacts(artifacts, fsImpl = fs) {
    const committed = [];

    try {
        for (const artifact of artifacts) {
            const backup = createBackup(artifact.destination, fsImpl);
            const record = { artifact, backup, installed: false, preserveBackup: false };
            committed.push(record);
            movePath(artifact.stagedPath, artifact.destination, fsImpl);
            record.installed = true;
        }
    } catch (error) {
        const rollbackErrors = [];
        for (const record of committed.reverse()) {
            try {
                if (record.installed) removePath(record.artifact.destination, fsImpl);
                if (record.backup && fsImpl.existsSync(record.backup.backupPath)) {
                    movePath(record.backup.backupPath, record.artifact.destination, fsImpl);
                }
            } catch (rollbackError) {
                if (record.backup && fsImpl.existsSync(record.backup.backupPath)) {
                    record.preserveBackup = true;
                    rollbackErrors.push(
                        `${rollbackError.message}; previous artifact preserved at ${record.backup.backupPath}`,
                    );
                } else {
                    rollbackErrors.push(rollbackError.message);
                }
            }
        }
        if (rollbackErrors.length > 0) {
            error.message += ` (rollback errors: ${rollbackErrors.join('; ')})`;
        }
        throw error;
    } finally {
        for (const record of committed) {
            if (record.backup && !record.preserveBackup) removePath(record.backup.workspace, fsImpl);
        }
    }
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function validateUserscript(file, expectedVersion, fsImpl = fs) {
    const source = readText(fsImpl, file);
    const endMarker = '// ==/UserScript==';
    const endIndex = source.indexOf(endMarker);
    if (!source.startsWith('// ==UserScript==') || endIndex === -1) {
        throw new Error('Userscript output has no complete metadata header');
    }

    const header = source.slice(0, endIndex + endMarker.length);
    const version = escapeRegExp(expectedVersion);
    if (!new RegExp(`^\\s*//\\s*@version\\s+${version}\\s*$`, 'm').test(header)) {
        throw new Error(`Userscript output header does not declare version ${expectedVersion}`);
    }
    if (!new RegExp(`^\\s*//\\s*@name\\s+.+\\(v${version}\\)\\s*$`, 'm').test(header)) {
        throw new Error(`Userscript output name does not declare version ${expectedVersion}`);
    }
    if (source.slice(endIndex + endMarker.length).trim().length === 0) {
        throw new Error('Userscript output contains a header but no bundle');
    }
}

function resolveArtifactPath(outputDir, relativePath) {
    if (typeof relativePath !== 'string' || relativePath.length === 0 || path.isAbsolute(relativePath)) {
        throw new Error(`Manifest contains an invalid artifact path: ${relativePath}`);
    }
    const resolved = path.resolve(outputDir, relativePath);
    const prefix = `${path.resolve(outputDir)}${path.sep}`;
    if (!resolved.startsWith(prefix)) {
        throw new Error(`Manifest artifact escapes the extension directory: ${relativePath}`);
    }
    return resolved;
}

function assertArtifactFile(outputDir, relativePath, fsImpl) {
    const file = resolveArtifactPath(outputDir, relativePath);
    if (!fsImpl.existsSync(file) || !fsImpl.statSync(file).isFile()) {
        throw new Error(`Extension artifact is missing: ${relativePath}`);
    }
    if (fsImpl.statSync(file).size === 0) {
        throw new Error(`Extension artifact is empty: ${relativePath}`);
    }
}

function validateExtension(outputDir, expectedVersion, fsImpl = fs) {
    const manifestFile = path.join(outputDir, 'manifest.json');
    assertArtifactFile(outputDir, 'manifest.json', fsImpl);

    let manifest;
    try {
        manifest = JSON.parse(readText(fsImpl, manifestFile));
    } catch (error) {
        throw new Error(`Built extension manifest is invalid: ${error.message}`);
    }

    if (manifest.manifest_version !== 3) throw new Error('Built extension must use manifest version 3');
    if (manifest.version !== expectedVersion) {
        throw new Error(`Built extension version ${manifest.version || 'missing'} does not match ${expectedVersion}`);
    }
    if (!Array.isArray(manifest.content_scripts) || manifest.content_scripts.length === 0) {
        throw new Error('Built extension has no content scripts');
    }

    const referencedFiles = [];
    for (const contentScript of manifest.content_scripts) {
        if (!Array.isArray(contentScript.js) || contentScript.js.length === 0) {
            throw new Error('Built extension content script has no JavaScript entry');
        }
        referencedFiles.push(...contentScript.js);
    }
    if (!manifest.background || !manifest.background.service_worker) {
        throw new Error('Built extension has no background service worker');
    }
    referencedFiles.push(manifest.background.service_worker);
    if (!Array.isArray(manifest.background.scripts) || manifest.background.scripts.length === 0) {
        throw new Error('Built extension has no Firefox background script fallback');
    }
    referencedFiles.push(...manifest.background.scripts);
    if (!manifest.icons || Object.keys(manifest.icons).length === 0) {
        throw new Error('Built extension has no icons');
    }
    referencedFiles.push(...Object.values(manifest.icons));

    for (const relativePath of new Set(referencedFiles)) {
        assertArtifactFile(outputDir, relativePath, fsImpl);
    }

    const contentEntry = manifest.content_scripts[0].js[0];
    const content = readText(fsImpl, resolveArtifactPath(outputDir, contentEntry));
    const initIndex = content.indexOf('await globalThis.__initGMPolyfill();');
    if (!content.startsWith('(async () => {') || initIndex === -1) {
        throw new Error('Built extension content script has no awaited GM_* initialization');
    }
    if (content.indexOf('// --- Main Application ---') < initIndex) {
        throw new Error('Built extension starts the application before GM_* initialization');
    }
}

function buildOptions(options) {
    if (options.minify !== undefined && typeof options.minify !== 'boolean') {
        throw new TypeError('minify must be a boolean');
    }
    return {
        buildSyncImpl: options.buildSyncImpl || buildSync,
        fsImpl: options.fsImpl || fs,
        minify: options.minify !== false,
        rootDir: options.rootDir || DEFAULT_ROOT,
        sizeBudgets: resolveSizeBudgets(options.sizeBudgets),
    };
}

function prepareUserscript(options, sourceContract) {
    const { buildSyncImpl, fsImpl, minify, rootDir, sizeBudgets } = buildOptions(options);
    const outputDir = options.outputDir || rootDir;
    const destination = path.join(outputDir, USERSCRIPT_FILENAME);
    const artifact = createStagedArtifact(destination, 'file', fsImpl);

    try {
        const result = buildSyncImpl(createBundleOptions(
            path.join(rootDir, 'src', 'main.js'),
            minify,
            { banner: { js: sourceContract.metadata } },
        ));
        fsImpl.writeFileSync(artifact.stagedPath, outputText(result, 'Userscript'), 'utf8');
        validateUserscript(artifact.stagedPath, sourceContract.version, fsImpl);
        artifact.report = createArtifactReport(artifact.stagedPath, {
            budgetBytes: sizeBudgets.userscriptRawBytes,
            file: USERSCRIPT_FILENAME,
            fsImpl,
            gzipBudgetBytes: sizeBudgets.userscriptGzipBytes,
            label: 'Userscript',
            minified: minify,
        });
        return artifact;
    } catch (error) {
        cleanupArtifacts([artifact], fsImpl);
        throw error;
    }
}

function prepareExtension(options, sourceContract) {
    const { buildSyncImpl, fsImpl, minify, rootDir, sizeBudgets } = buildOptions(options);
    const outputDir = options.outputDir || path.join(rootDir, 'dist', 'extension');
    const artifact = createStagedArtifact(outputDir, 'directory', fsImpl);

    try {
        const extensionSource = path.join(rootDir, 'src', 'platforms', 'extension');
        const polyfillResult = buildSyncImpl(createBundleOptions(
            path.join(extensionSource, 'content.js'),
            minify,
        ));
        const polyfillCode = outputText(polyfillResult, 'Extension polyfill');

        const mainResult = buildSyncImpl(createBundleOptions(
            path.join(rootDir, 'src', 'main.js'),
            minify,
        ));
        const mainCode = outputText(mainResult, 'Extension application');

        const combined = [
            '(async () => {',
            '// --- GM_* Polyfill ---',
            polyfillCode,
            '// --- Init polyfill (preload chrome.storage) ---',
            'await globalThis.__initGMPolyfill();',
            '// --- Main Application ---',
            mainCode,
            '})();',
        ].join('\n');
        fsImpl.writeFileSync(path.join(artifact.stagedPath, 'content.js'), combined, 'utf8');

        for (const file of ['manifest.json', 'background.js']) {
            fsImpl.copyFileSync(path.join(extensionSource, file), path.join(artifact.stagedPath, file));
        }

        const iconsSource = path.join(extensionSource, 'icons');
        if (fsImpl.existsSync(iconsSource)) {
            const iconsOutput = path.join(artifact.stagedPath, 'icons');
            fsImpl.mkdirSync(iconsOutput, { recursive: true });
            for (const file of fsImpl.readdirSync(iconsSource)) {
                const source = path.join(iconsSource, file);
                if (fsImpl.statSync(source).isFile()) {
                    fsImpl.copyFileSync(source, path.join(iconsOutput, file));
                }
            }
        }

        validateExtension(artifact.stagedPath, sourceContract.version, fsImpl);
        artifact.report = createArtifactReport(path.join(artifact.stagedPath, 'content.js'), {
            budgetBytes: sizeBudgets.extensionContentRawBytes,
            file: 'content.js',
            fsImpl,
            gzipBudgetBytes: sizeBudgets.extensionContentGzipBytes,
            label: 'Extension content.js',
            minified: minify,
        });
        return artifact;
    } catch (error) {
        cleanupArtifacts([artifact], fsImpl);
        throw error;
    }
}

function buildUserscript(options = {}) {
    const { fsImpl, rootDir } = buildOptions(options);
    const sourceContract = readSourceContract(rootDir, fsImpl);
    const artifact = prepareUserscript(options, sourceContract);
    try {
        commitArtifacts([artifact], fsImpl);
    } finally {
        cleanupArtifacts([artifact], fsImpl);
    }
    return { artifact: artifact.report, outputFile: artifact.destination, version: sourceContract.version };
}

function buildExtension(options = {}) {
    const { fsImpl, rootDir } = buildOptions(options);
    const sourceContract = readSourceContract(rootDir, fsImpl);
    const artifact = prepareExtension(options, sourceContract);
    try {
        commitArtifacts([artifact], fsImpl);
    } finally {
        cleanupArtifacts([artifact], fsImpl);
    }
    return { artifact: artifact.report, outputDir: artifact.destination, version: sourceContract.version };
}

function buildAll(options = {}) {
    const { fsImpl, rootDir } = buildOptions(options);
    const sourceContract = readSourceContract(rootDir, fsImpl);
    const userscriptOptions = { ...options, outputDir: options.userscriptOutputDir || rootDir };
    const extensionOptions = {
        ...options,
        outputDir: options.extensionOutputDir || path.join(rootDir, 'dist', 'extension'),
    };
    const artifacts = [];

    try {
        artifacts.push(prepareUserscript(userscriptOptions, sourceContract));
        artifacts.push(prepareExtension(extensionOptions, sourceContract));
        commitArtifacts(artifacts, fsImpl);
    } finally {
        cleanupArtifacts(artifacts, fsImpl);
    }

    return {
        extension: {
            artifact: artifacts[1].report,
            outputDir: artifacts[1].destination,
            version: sourceContract.version,
        },
        userscript: {
            artifact: artifacts[0].report,
            outputFile: artifacts[0].destination,
            version: sourceContract.version,
        },
        version: sourceContract.version,
    };
}

module.exports = {
    BACKUP_PREFIX,
    DEFAULT_ARTIFACT_SIZE_BUDGETS,
    STAGE_PREFIX,
    USERSCRIPT_FILENAME,
    buildAll,
    buildExtension,
    buildUserscript,
    commitArtifacts,
    createArtifactReport,
    readSourceContract,
    validateExtension,
    validateUserscript,
};
