const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { gzipSync } = require('node:zlib');
const vm = require('node:vm');
const { buildSync } = require('esbuild');

const {
    BACKUP_PREFIX,
    DEFAULT_ARTIFACT_SIZE_BUDGETS,
    STAGE_PREFIX,
    buildAll,
    buildExtension,
    buildUserscript,
    commitArtifacts,
    createArtifactReport,
    readSourceContract,
    validateExtension,
    validateUserscript,
} = require('../scripts/build_core');
const {
    buildOptionsFromEnvironment,
    formatArtifactReport,
    logArtifact,
    main,
    runBuild,
} = require('../scripts/build');

const root = path.join(__dirname, '..');

function listJavaScriptFiles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const file = path.join(directory, entry.name);
        return entry.isDirectory() ? listJavaScriptFiles(file) : (file.endsWith('.js') ? [file] : []);
    });
}

function bundledProbe(source, keepNames) {
    const result = buildSync({
        stdin: {
            contents: source,
            loader: 'js',
            resolveDir: root,
            sourcefile: 'build-name-probe.js',
        },
        bundle: true,
        charset: 'utf8',
        format: 'iife',
        keepNames,
        legalComments: 'none',
        logLevel: 'silent',
        minify: true,
        target: 'es2020',
        treeShaking: true,
        write: false,
    });
    return Buffer.from(result.outputFiles[0].contents).toString('utf8');
}

function temporaryDirectory(t) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'primer-pp-build-test-'));
    t.after(() => fs.rmSync(directory, { force: true, recursive: true }));
    return directory;
}

function fsWith(overrides) {
    return new Proxy(fs, {
        get(target, property) {
            return Object.prototype.hasOwnProperty.call(overrides, property)
                ? overrides[property]
                : target[property];
        },
    });
}

function bundleResult(source) {
    return { errors: [], outputFiles: [{ contents: Buffer.from(source) }] };
}

function successfulFakeBuild(options) {
    if (options.banner) {
        return bundleResult(`${options.banner.js}\n(() => { globalThis.__primerTest = true; })();`);
    }
    if (path.basename(options.entryPoints[0]) === 'content.js') {
        return bundleResult('globalThis.__initGMPolyfill = async () => {};');
    }
    return bundleResult('(() => { globalThis.__primerMainTest = true; })();');
}

function fakeArtifactReport(overrides = {}) {
    return {
        budgetBytes: 835_000,
        file: 'fixture.js',
        gzipBudgetBytes: 245_000,
        gzipBytes: 45,
        minified: true,
        rawBytes: 123,
        sha256: 'a'.repeat(64),
        ...overrides,
    };
}

function createExistingOutputs(base) {
    const userscriptOutputDir = path.join(base, 'artifacts');
    const extensionOutputDir = path.join(userscriptOutputDir, 'extension');
    fs.mkdirSync(extensionOutputDir, { recursive: true });
    fs.writeFileSync(path.join(userscriptOutputDir, 'primer-pp.user.js'), 'old userscript', 'utf8');
    fs.writeFileSync(path.join(extensionOutputDir, 'old-extension.txt'), 'old extension', 'utf8');
    return { extensionOutputDir, userscriptOutputDir };
}

function assertExistingOutputsWerePreserved(outputs) {
    assert.equal(
        fs.readFileSync(path.join(outputs.userscriptOutputDir, 'primer-pp.user.js'), 'utf8'),
        'old userscript',
    );
    assert.equal(
        fs.readFileSync(path.join(outputs.extensionOutputDir, 'old-extension.txt'), 'utf8'),
        'old extension',
    );
}

function assertNoTransactionDebris(directory) {
    const debris = fs.readdirSync(directory).filter(
        (name) => name.startsWith(STAGE_PREFIX) || name.startsWith(BACKUP_PREFIX),
    );
    assert.deepEqual(debris, []);
}

function createSourceFixture(t, { icons = true, manifest = {} } = {}) {
    const fixture = temporaryDirectory(t);
    const extension = path.join(fixture, 'src', 'platforms', 'extension');
    fs.mkdirSync(extension, { recursive: true });
    fs.writeFileSync(
        path.join(fixture, 'src', 'meta.txt'),
        [
            '// ==UserScript==',
            '// @name Primer++ Fixture (v12.0)',
            '// @version 12.0',
            '// ==/UserScript==',
        ].join('\n'),
        'utf8',
    );
    const fixtureManifest = {
        manifest_version: 3,
        version: '12.0',
        content_scripts: [{ matches: ['https://gemini.google.com/*'], js: ['content.js'] }],
        background: { service_worker: 'background.js', scripts: ['background.js'] },
        icons: icons
            ? { 16: 'icons/icon-16.png' }
            : { 16: 'background.js' },
        ...manifest,
    };
    fs.writeFileSync(path.join(extension, 'manifest.json'), JSON.stringify(fixtureManifest), 'utf8');
    fs.writeFileSync(path.join(extension, 'background.js'), 'void 0;', 'utf8');
    fs.writeFileSync(path.join(extension, 'content.js'), 'void 0;', 'utf8');
    fs.writeFileSync(path.join(fixture, 'src', 'main.js'), 'void 0;', 'utf8');
    if (icons) {
        const iconDirectory = path.join(extension, 'icons');
        fs.mkdirSync(path.join(iconDirectory, 'nested'), { recursive: true });
        fs.writeFileSync(path.join(iconDirectory, 'icon-16.png'), 'fixture-icon', 'utf8');
    }
    return fixture;
}

function writeValidUserscript(file, version = '12.0') {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, [
        '// ==UserScript==',
        `// @name Primer++ Fixture (v${version})`,
        `// @version ${version}`,
        '// ==/UserScript==',
        '(() => true)();',
    ].join('\n'), 'utf8');
}

function createValidExtension(t, overrides = {}) {
    const directory = temporaryDirectory(t);
    const manifest = {
        manifest_version: 3,
        version: '12.0',
        content_scripts: [{ js: ['content.js'] }],
        background: { service_worker: 'background.js', scripts: ['background.js'] },
        icons: { 16: 'icon.png' },
        ...overrides,
    };
    fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest), 'utf8');
    fs.writeFileSync(
        path.join(directory, 'content.js'),
        [
            '(async () => {',
            'await globalThis.__initGMPolyfill();',
            '// --- Main Application ---',
            '})();',
        ].join('\n'),
        'utf8',
    );
    fs.writeFileSync(path.join(directory, 'background.js'), 'void 0;', 'utf8');
    fs.writeFileSync(path.join(directory, 'icon.png'), 'icon', 'utf8');
    return directory;
}

function createCommitArtifact(t, { name, type = 'file', existing = null } = {}) {
    const base = temporaryDirectory(t);
    const workspace = fs.mkdtempSync(path.join(base, STAGE_PREFIX));
    const destination = path.join(base, name);
    const stagedPath = path.join(workspace, type === 'directory' ? 'payload' : name);
    if (type === 'directory') {
        fs.mkdirSync(stagedPath, { recursive: true });
        fs.writeFileSync(path.join(stagedPath, 'new.txt'), 'new', 'utf8');
    } else {
        fs.writeFileSync(stagedPath, 'new', 'utf8');
    }
    if (existing !== null) {
        if (type === 'directory') {
            fs.mkdirSync(destination, { recursive: true });
            fs.writeFileSync(path.join(destination, 'old.txt'), existing, 'utf8');
        } else {
            fs.writeFileSync(destination, existing, 'utf8');
        }
    }
    return { artifact: { destination, stagedPath, type, workspace }, base };
}

function exdev(message = 'cross-device rename') {
    const error = new Error(message);
    error.code = 'EXDEV';
    return error;
}

describe('atomic build pipeline', () => {
    it('builds validated userscript and extension artifacts into injected output directories', (t) => {
        const base = temporaryDirectory(t);
        const outputs = createExistingOutputs(base);

        const result = buildAll({
            rootDir: root,
            userscriptOutputDir: outputs.userscriptOutputDir,
            extensionOutputDir: outputs.extensionOutputDir,
        });

        assert.equal(result.version, '13.0');
        assert.equal(result.userscript.outputFile, path.join(outputs.userscriptOutputDir, 'primer-pp.user.js'));
        assert.equal(result.extension.outputDir, outputs.extensionOutputDir);

        const userscript = fs.readFileSync(result.userscript.outputFile, 'utf8');
        assert.match(userscript, /^\/\/ ==UserScript==/);
        assert.match(userscript, /^\/\/ @version\s+13\.0\s*$/m);
        assert.match(userscript, /^\/\/ @name\s+Primer\+\+ for Gemini™ \(v13\.0\)\s*$/m);
        const metadataEnd = userscript.indexOf('// ==/UserScript==') + '// ==/UserScript=='.length;
        assert.doesNotThrow(() => new Function(userscript.slice(metadataEnd)));
        assert.deepEqual(result.userscript.artifact, {
            budgetBytes: DEFAULT_ARTIFACT_SIZE_BUDGETS.userscriptRawBytes,
            file: 'primer-pp.user.js',
            gzipBudgetBytes: DEFAULT_ARTIFACT_SIZE_BUDGETS.userscriptGzipBytes,
            gzipBytes: gzipSync(Buffer.from(userscript), { level: 9 }).length,
            minified: true,
            rawBytes: Buffer.byteLength(userscript),
            sha256: createHash('sha256').update(userscript).digest('hex'),
        });

        const manifest = JSON.parse(fs.readFileSync(path.join(result.extension.outputDir, 'manifest.json'), 'utf8'));
        assert.equal(manifest.manifest_version, 3);
        assert.equal(manifest.version, '13.0');
        for (const file of [
            'content.js',
            'background.js',
            'icons/icon-16.png',
            'icons/icon-48.png',
            'icons/icon-128.png',
        ]) {
            assert.ok(fs.statSync(path.join(result.extension.outputDir, file)).size > 0, `${file} must exist`);
        }
        const extensionContent = fs.readFileSync(path.join(result.extension.outputDir, 'content.js'), 'utf8');
        assert.doesNotThrow(() => new Function(extensionContent));
        assert.ok(
            extensionContent.indexOf('await globalThis.__initGMPolyfill();')
            < extensionContent.indexOf('// --- Main Application ---'),
        );
        assert.deepEqual(result.extension.artifact, {
            budgetBytes: DEFAULT_ARTIFACT_SIZE_BUDGETS.extensionContentRawBytes,
            file: 'content.js',
            gzipBudgetBytes: DEFAULT_ARTIFACT_SIZE_BUDGETS.extensionContentGzipBytes,
            gzipBytes: gzipSync(Buffer.from(extensionContent), { level: 9 }).length,
            minified: true,
            rawBytes: Buffer.byteLength(extensionContent),
            sha256: createHash('sha256').update(extensionContent).digest('hex'),
        });

        const repeat = buildAll({
            rootDir: root,
            userscriptOutputDir: path.join(base, 'repeat-userscript'),
            extensionOutputDir: path.join(base, 'repeat-extension'),
        });
        assert.equal(repeat.userscript.artifact.sha256, result.userscript.artifact.sha256);
        assert.equal(repeat.extension.artifact.sha256, result.extension.artifact.sha256);
        assert.equal(fs.existsSync(path.join(result.extension.outputDir, 'old-extension.txt')), false);
        assertNoTransactionDebris(outputs.userscriptOutputDir);
    });

    it('does not publish either platform when an extension bundle fails', (t) => {
        const outputs = createExistingOutputs(temporaryDirectory(t));
        let buildCalls = 0;
        const buildSyncImpl = (options) => {
            buildCalls += 1;
            if (options.banner) return successfulFakeBuild(options);
            throw new Error('injected extension bundle failure');
        };

        assert.throws(
            () => buildAll({ ...outputs, rootDir: root, buildSyncImpl }),
            /injected extension bundle failure/,
        );
        assert.equal(buildCalls, 2, 'userscript and first extension bundle should be the only build attempts');
        assertExistingOutputsWerePreserved(outputs);
        assertNoTransactionDebris(outputs.userscriptOutputDir);
    });

    it('stops the extension pipeline before its second bundle and asset copies after a bundle error', (t) => {
        const outputs = createExistingOutputs(temporaryDirectory(t));
        let buildCalls = 0;
        let copyCalls = 0;
        const fsImpl = fsWith({
            copyFileSync(...args) {
                copyCalls += 1;
                return fs.copyFileSync(...args);
            },
        });

        assert.throws(
            () => buildExtension({
                rootDir: root,
                outputDir: outputs.extensionOutputDir,
                fsImpl,
                buildSyncImpl() {
                    buildCalls += 1;
                    throw new Error('polyfill failed');
                },
            }),
            /polyfill failed/,
        );
        assert.equal(buildCalls, 1);
        assert.equal(copyCalls, 0);
        assertExistingOutputsWerePreserved(outputs);
        assertNoTransactionDebris(outputs.userscriptOutputDir);
    });

    it('leaves the previous extension intact when an asset copy fails', (t) => {
        const outputs = createExistingOutputs(temporaryDirectory(t));
        let copyCalls = 0;
        const fsImpl = fsWith({
            copyFileSync(...args) {
                copyCalls += 1;
                if (copyCalls === 2) throw new Error('injected copy failure');
                return fs.copyFileSync(...args);
            },
        });

        assert.throws(
            () => buildExtension({
                rootDir: root,
                outputDir: outputs.extensionOutputDir,
                fsImpl,
                buildSyncImpl: successfulFakeBuild,
            }),
            /injected copy failure/,
        );
        assert.equal(copyCalls, 2);
        assertExistingOutputsWerePreserved(outputs);
        assertNoTransactionDebris(outputs.userscriptOutputDir);
    });

    it('rolls both platforms back if the final extension replacement fails', (t) => {
        const outputs = createExistingOutputs(temporaryDirectory(t));
        let injected = false;
        const fsImpl = fsWith({
            renameSync(source, destination) {
                if (
                    !injected
                    && destination === outputs.extensionOutputDir
                    && source.includes(STAGE_PREFIX)
                ) {
                    injected = true;
                    throw new Error('injected commit failure');
                }
                return fs.renameSync(source, destination);
            },
        });

        assert.throws(
            () => buildAll({
                ...outputs,
                rootDir: root,
                fsImpl,
                buildSyncImpl: successfulFakeBuild,
            }),
            /injected commit failure/,
        );
        assert.equal(injected, true);
        assertExistingOutputsWerePreserved(outputs);
        assertNoTransactionDebris(outputs.userscriptOutputDir);
    });

    it('rejects source version drift before bundling or replacing an existing userscript', (t) => {
        const outputs = createExistingOutputs(temporaryDirectory(t));
        const manifestPath = path.join(root, 'src', 'platforms', 'extension', 'manifest.json');
        let buildCalls = 0;
        const fsImpl = fsWith({
            readFileSync(file, ...args) {
                if (path.resolve(file) === path.resolve(manifestPath)) {
                    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
                    manifest.version = '99.0';
                    return JSON.stringify(manifest);
                }
                return fs.readFileSync(file, ...args);
            },
        });

        assert.throws(
            () => buildUserscript({
                rootDir: root,
                outputDir: outputs.userscriptOutputDir,
                fsImpl,
                buildSyncImpl() {
                    buildCalls += 1;
                    return successfulFakeBuild(...arguments);
                },
            }),
            /Version mismatch: userscript is 13\.0, extension is 99\.0/,
        );
        assert.equal(buildCalls, 0);
        assertExistingOutputsWerePreserved(outputs);
        assertNoTransactionDebris(outputs.userscriptOutputDir);
    });

    it('enforces raw and gzip-9 budgets before publishing either platform', (t) => {
        const outputs = createExistingOutputs(temporaryDirectory(t));
        assert.throws(
            () => buildAll({
                ...outputs,
                rootDir: root,
                buildSyncImpl: successfulFakeBuild,
                sizeBudgets: {
                    extensionContentRawBytes: 1,
                    userscriptRawBytes: 10_000,
                },
            }),
            /Extension content\.js raw artifact is \d+ bytes, exceeding the 1-byte budget/,
        );
        assertExistingOutputsWerePreserved(outputs);
        assertNoTransactionDebris(outputs.userscriptOutputDir);

        assert.throws(
            () => buildUserscript({
                rootDir: root,
                outputDir: outputs.userscriptOutputDir,
                buildSyncImpl: successfulFakeBuild,
                sizeBudgets: { userscriptRawBytes: 1 },
            }),
            /Userscript raw artifact is \d+ bytes, exceeding the 1-byte budget/,
        );
        assertExistingOutputsWerePreserved(outputs);
        assertNoTransactionDebris(outputs.userscriptOutputDir);

        assert.throws(
            () => buildAll({
                ...outputs,
                rootDir: root,
                buildSyncImpl: successfulFakeBuild,
                sizeBudgets: {
                    extensionContentGzipBytes: 1,
                    extensionContentRawBytes: 10_000,
                    userscriptGzipBytes: 10_000,
                    userscriptRawBytes: 10_000,
                },
            }),
            /Extension content\.js gzip-9 artifact is \d+ bytes, exceeding the 1-byte budget/,
        );
        assertExistingOutputsWerePreserved(outputs);
        assertNoTransactionDebris(outputs.userscriptOutputDir);

        assert.throws(
            () => buildUserscript({
                rootDir: root,
                outputDir: outputs.userscriptOutputDir,
                buildSyncImpl: successfulFakeBuild,
                sizeBudgets: {
                    userscriptGzipBytes: 1,
                    userscriptRawBytes: 10_000,
                },
            }),
            /Userscript gzip-9 artifact is \d+ bytes, exceeding the 1-byte budget/,
        );
        assertExistingOutputsWerePreserved(outputs);
        assertNoTransactionDebris(outputs.userscriptOutputDir);
    });
});

describe('build CLI routing', () => {
    it('routes every target through the injected build API and returns its result', () => {
        const calls = [];
        const logs = [];
        const api = {
            buildAll(options) {
                calls.push(['all', options]);
                return {
                    userscript: {
                        artifact: fakeArtifactReport(),
                        outputFile: '/tmp/all.user.js',
                    },
                    extension: {
                        artifact: fakeArtifactReport({
                            budgetBytes: null,
                            gzipBudgetBytes: null,
                            gzipBytes: 78,
                            minified: false,
                            rawBytes: 456,
                        }),
                        outputDir: '/tmp/all-extension',
                    },
                };
            },
            buildUserscript(options) {
                calls.push(['userscript', options]);
                return { artifact: fakeArtifactReport(), outputFile: '/tmp/one.user.js' };
            },
            buildExtension(options) {
                calls.push(['extension', options]);
                return { artifact: fakeArtifactReport(), outputDir: '/tmp/one-extension' };
            },
        };
        const options = {
            rootDir: '/fixture',
            userscriptOutputDir: '/fixture/userscript',
            extensionOutputDir: '/fixture/extension',
        };

        assert.equal(runBuild('all', options, api, message => logs.push(message)).userscript.outputFile, '/tmp/all.user.js');
        assert.equal(runBuild('userscript', options, api, message => logs.push(message)).outputFile, '/tmp/one.user.js');
        assert.equal(runBuild('extension', options, api, message => logs.push(message)).outputDir, '/tmp/one-extension');
        assert.throws(() => runBuild('invalid', options, api, () => {}), /Unsupported TARGET: invalid/);
        assert.deepEqual(calls, [
            ['all', options],
            ['userscript', { ...options, outputDir: options.userscriptOutputDir }],
            ['extension', { ...options, outputDir: options.extensionOutputDir }],
        ]);
        assert.deepEqual(logs, [
            `✓ Userscript: /tmp/all.user.js (123 B raw; 45 B gzip-9; SHA-256 ${'a'.repeat(64)}; `
                + 'budgets raw 835000 B, gzip-9 245000 B; minified)',
            `✓ Extension content.js: ${path.join('/tmp/all-extension', 'content.js')} `
                + `(456 B raw; 78 B gzip-9; SHA-256 ${'a'.repeat(64)}; `
                + 'budgets raw disabled, gzip-9 disabled; unminified)',
            `✓ Userscript: /tmp/one.user.js (123 B raw; 45 B gzip-9; SHA-256 ${'a'.repeat(64)}; `
                + 'budgets raw 835000 B, gzip-9 245000 B; minified)',
            `✓ Extension content.js: ${path.join('/tmp/one-extension', 'content.js')} `
                + `(123 B raw; 45 B gzip-9; SHA-256 ${'a'.repeat(64)}; `
                + 'budgets raw 835000 B, gzip-9 245000 B; minified)',
        ]);
    });

    it('formats and emits auditable artifact reports', () => {
        const report = fakeArtifactReport();
        assert.equal(
            formatArtifactReport(report),
            `123 B raw; 45 B gzip-9; SHA-256 ${'a'.repeat(64)}; `
                + 'budgets raw 835000 B, gzip-9 245000 B; minified',
        );
        const logs = [];
        logArtifact(message => logs.push(message), 'Fixture', '/tmp/fixture.js', report);
        assert.deepEqual(logs, [
            `✓ Fixture: /tmp/fixture.js (123 B raw; 45 B gzip-9; SHA-256 ${'a'.repeat(64)}; `
                + 'budgets raw 835000 B, gzip-9 245000 B; minified)',
        ]);
    });

    it('maps environment output overrides without adding policy', () => {
        const environment = {
            PRIMER_PP_BUILD_ROOT: '/root',
            PRIMER_PP_USERSCRIPT_OUTPUT_DIR: '/userscript',
            PRIMER_PP_EXTENSION_OUTPUT_DIR: '/extension',
        };
        assert.deepEqual(buildOptionsFromEnvironment(environment), {
            rootDir: '/root',
            userscriptOutputDir: '/userscript',
            extensionOutputDir: '/extension',
        });
        assert.deepEqual(buildOptionsFromEnvironment({}), {
            rootDir: undefined,
            userscriptOutputDir: undefined,
            extensionOutputDir: undefined,
        });
    });

    it('reports main() failures through the process exit contract', () => {
        const previousExitCode = process.exitCode;
        const previousError = console.error;
        const errors = [];
        console.error = message => errors.push(message);
        process.exitCode = undefined;
        try {
            assert.equal(main({ TARGET: 'invalid' }), null);
            assert.equal(process.exitCode, 1);
            assert.deepEqual(errors, ['Build failed: Unsupported TARGET: invalid']);
        } finally {
            console.error = previousError;
            process.exitCode = previousExitCode;
        }
    });

    for (const target of [undefined, 'userscript', 'extension', 'invalid']) {
        it(`runs TARGET=${target || 'all(default)'} through the real CLI in an isolated output directory`, (t) => {
            const base = temporaryDirectory(t);
            const userscriptOutput = path.join(base, 'userscript');
            const extensionOutput = path.join(base, 'extension');
            const environment = {
                ...process.env,
                PRIMER_PP_BUILD_ROOT: root,
                PRIMER_PP_USERSCRIPT_OUTPUT_DIR: userscriptOutput,
                PRIMER_PP_EXTENSION_OUTPUT_DIR: extensionOutput,
            };
            if (target === undefined) delete environment.TARGET;
            else environment.TARGET = target;

            const result = spawnSync(process.execPath, ['scripts/build.js'], {
                cwd: root,
                encoding: 'utf8',
                env: environment,
            });

            if (target === 'invalid') {
                assert.equal(result.status, 1);
                assert.match(result.stderr, /Build failed: Unsupported TARGET: invalid/);
                return;
            }
            assert.equal(result.status, 0, result.stderr);
            if (target === undefined || target === 'userscript') {
                assert.match(
                    result.stdout,
                    /✓ Userscript: .+ \(\d+ B raw; \d+ B gzip-9; SHA-256 [a-f0-9]{64}; budgets raw 835000 B, gzip-9 245000 B; minified\)/,
                );
                assert.ok(fs.statSync(path.join(userscriptOutput, 'primer-pp.user.js')).size > 0);
            }
            if (target === undefined || target === 'extension') {
                assert.match(
                    result.stdout,
                    /✓ Extension content\.js: .+ \(\d+ B raw; \d+ B gzip-9; SHA-256 [a-f0-9]{64}; budgets raw 835000 B, gzip-9 245000 B; minified\)/,
                );
                assert.ok(fs.statSync(path.join(extensionOutput, 'content.js')).size > 0);
            }
        });
    }

    for (const target of ['userscript', 'extension']) {
        it(`supports the npm build:${target} node-e require entry point`, (t) => {
            const base = temporaryDirectory(t);
            const userscriptOutput = path.join(base, 'userscript');
            const extensionOutput = path.join(base, 'extension');
            const result = spawnSync(
                process.execPath,
                ['-e', `process.env.TARGET='${target}';require('./scripts/build.js')`],
                {
                    cwd: root,
                    encoding: 'utf8',
                    env: {
                        ...process.env,
                        PRIMER_PP_BUILD_ROOT: root,
                        PRIMER_PP_USERSCRIPT_OUTPUT_DIR: userscriptOutput,
                        PRIMER_PP_EXTENSION_OUTPUT_DIR: extensionOutput,
                    },
                },
            );

            assert.equal(result.status, 0, result.stderr);
            if (target === 'userscript') {
                assert.match(result.stdout, /✓ Userscript: .+ SHA-256 [a-f0-9]{64}/);
                assert.ok(fs.statSync(path.join(userscriptOutput, 'primer-pp.user.js')).size > 0);
            } else {
                assert.match(result.stdout, /✓ Extension content\.js: .+ SHA-256 [a-f0-9]{64}/);
                assert.ok(fs.statSync(path.join(extensionOutput, 'content.js')).size > 0);
            }
        });
    }
});

describe('minification and artifact audit policy', () => {
    it('reports exact raw/gzip-9 bytes and SHA-256 rather than an extension-store ZIP size', (t) => {
        const directory = temporaryDirectory(t);
        const file = path.join(directory, 'artifact.js');
        const bytes = Buffer.from('const greeting = "你好";\n', 'utf8');
        fs.writeFileSync(file, bytes);

        const report = createArtifactReport(file);
        assert.deepEqual(report, {
            budgetBytes: null,
            file: 'artifact.js',
            gzipBudgetBytes: null,
            gzipBytes: gzipSync(bytes, { level: 9 }).length,
            minified: false,
            rawBytes: bytes.length,
            sha256: createHash('sha256').update(bytes).digest('hex'),
        });
        assert.equal(Object.isFrozen(report), true);
        assert.deepEqual(DEFAULT_ARTIFACT_SIZE_BUDGETS, {
            extensionContentGzipBytes: 245_000,
            extensionContentRawBytes: 835_000,
            userscriptGzipBytes: 245_000,
            userscriptRawBytes: 835_000,
        });

        assert.doesNotThrow(() => createArtifactReport(file, {
            budgetBytes: bytes.length,
            gzipBudgetBytes: report.gzipBytes,
        }));

        assert.throws(
            () => createArtifactReport(file, { budgetBytes: 1 }),
            /artifact\.js raw artifact is \d+ bytes, exceeding the 1-byte budget/,
        );
        assert.throws(
            () => createArtifactReport(file, { budgetBytes: 1, label: 'Fixture bundle' }),
            /Fixture bundle raw artifact is \d+ bytes, exceeding the 1-byte budget/,
        );
        assert.throws(
            () => createArtifactReport(file, {
                budgetBytes: bytes.length,
                gzipBudgetBytes: report.gzipBytes - 1,
            }),
            /artifact\.js gzip-9 artifact is \d+ bytes, exceeding the \d+-byte budget/,
        );
    });

    it('applies one deterministic production policy to all three esbuild bundles', (t) => {
        const fixture = createSourceFixture(t);
        const output = temporaryDirectory(t);
        const calls = [];
        const result = buildAll({
            rootDir: fixture,
            userscriptOutputDir: path.join(output, 'userscript'),
            extensionOutputDir: path.join(output, 'extension'),
            buildSyncImpl(options) {
                calls.push(options);
                return successfulFakeBuild(options);
            },
        });

        assert.equal(calls.length, 3);
        for (const options of calls) {
            assert.equal(options.minify, true);
            assert.equal(options.keepNames, false);
            assert.equal(options.legalComments, 'none');
            assert.equal(options.treeShaking, true);
            assert.equal(options.bundle, true);
            assert.equal(options.charset, 'utf8');
            assert.equal(options.format, 'iife');
            assert.equal(options.logLevel, 'silent');
            assert.equal(options.target, 'es2020');
            assert.equal(options.write, false);
        }
        const commonOptionKeys = [
            'bundle',
            'charset',
            'format',
            'keepNames',
            'legalComments',
            'logLevel',
            'minify',
            'target',
            'treeShaking',
            'write',
        ];
        const commonOptions = calls.map(options => Object.fromEntries(
            commonOptionKeys.map(key => [key, options[key]]),
        ));
        assert.deepEqual(commonOptions[1], commonOptions[0]);
        assert.deepEqual(commonOptions[2], commonOptions[0]);
        assert.ok(calls[0].banner);
        assert.equal(calls[1].banner, undefined);
        assert.equal(calls[2].banner, undefined);
        for (const options of calls) {
            assert.equal(options.footer, undefined);
            assert.equal(options.mangleProps, undefined);
            assert.equal(options.sourcemap, undefined);
        }
        assert.equal(result.userscript.artifact.minified, true);
        assert.equal(result.extension.artifact.minified, true);
        assert.equal(result.userscript.artifact.budgetBytes, 835_000);
        assert.equal(result.userscript.artifact.gzipBudgetBytes, 245_000);
        assert.equal(result.extension.artifact.budgetBytes, 835_000);
        assert.equal(result.extension.artifact.gzipBudgetBytes, 245_000);
    });

    it('supports explicit unminified measurement builds with disabled budgets', (t) => {
        const fixture = createSourceFixture(t);
        const output = temporaryDirectory(t);
        let receivedOptions;
        const result = buildUserscript({
            rootDir: fixture,
            outputDir: output,
            minify: false,
            sizeBudgets: false,
            buildSyncImpl(options) {
                receivedOptions = options;
                return successfulFakeBuild(options);
            },
        });

        assert.equal(receivedOptions.minify, false);
        assert.equal(receivedOptions.keepNames, false);
        assert.equal(result.artifact.minified, false);
        assert.equal(result.artifact.budgetBytes, null);
        assert.equal(result.artifact.gzipBudgetBytes, null);
    });

    it('preserves non-ASCII source text under the explicit UTF-8 bundle policy', () => {
        const expected = '中文 é 🧪';
        const source = `globalThis.__utf8Probe = ${JSON.stringify(expected)};`;
        const output = bundledProbe(source, false);
        const context = {};
        vm.runInNewContext(output, context);

        assert.equal(context.__utf8Probe, expected);
        assert.match(output, /中文/);
        assert.match(output, /🧪/);
        assert.doesNotMatch(output, /\\u4e2d\\u6587/i);
    });

    it('guards keepNames=false with a source audit and executable diagnostic-name probe', () => {
        const violations = [];
        const directReflectionPatterns = [
            /\bconstructor\s*(?:\.\s*name|\[\s*['"]name['"]\s*\])/g,
            /\bFunction\s*(?:\.\s*name|\[\s*['"]name['"]\s*\])/g,
            /\b[A-Z][\w$]*\s*(?:\.\s*name|\[\s*['"]name['"]\s*\])/g,
            /\b(?:Object\.getOwnPropertyDescriptor|Reflect\.get)\s*\([^,]+,\s*['"]name['"]/g,
        ];

        for (const file of [
            ...listJavaScriptFiles(path.join(root, 'src')),
            ...listJavaScriptFiles(path.join(root, 'lib')),
        ]) {
            const source = fs.readFileSync(file, 'utf8');
            for (const pattern of directReflectionPatterns) {
                for (const match of source.matchAll(pattern)) {
                    violations.push(`${path.relative(root, file)}: ${match[0]}`);
                }
            }

            const callableNames = new Set([
                ...Array.from(source.matchAll(/\b(?:class|function)\s+([A-Za-z_$][\w$]*)/g), match => match[1]),
                ...Array.from(
                    source.matchAll(
                        /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>)/g,
                    ),
                    match => match[1],
                ),
            ]);
            for (const name of callableNames) {
                const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const pattern = new RegExp(`\\b${escaped}\\s*(?:\\.\\s*name|\\[\\s*['"]name['"]\\s*\\])`, 'g');
                for (const match of source.matchAll(pattern)) {
                    violations.push(`${path.relative(root, file)}: ${match[0]}`);
                }
            }
        }
        assert.deepEqual(violations, []);

        const synthetic = [
            'class ReflectiveClass {}',
            'function reflectiveFunction() {}',
            'globalThis.__syntheticNames = [ReflectiveClass.name, reflectiveFunction.name];',
        ].join('\n');
        const keptContext = {};
        const droppedContext = {};
        vm.runInNewContext(bundledProbe(synthetic, true), keptContext);
        vm.runInNewContext(bundledProbe(synthetic, false), droppedContext);
        assert.deepEqual(Array.from(keptContext.__syntheticNames), ['ReflectiveClass', 'reflectiveFunction']);
        assert.notDeepEqual(Array.from(droppedContext.__syntheticNames), ['ReflectiveClass', 'reflectiveFunction']);

        const diagnosticProbe = [
            "import { InsightsError, CorruptInsightsStateError, FutureInsightsSchemaError, InsightsLimitError, InsightsReadOnlyError } from './src/features/insights/event_model.js';",
            'globalThis.__diagnosticNames = [',
            "  new InsightsError('fixture', 'FIXTURE').name,",
            '  new CorruptInsightsStateError().name,',
            '  new FutureInsightsSchemaError(2).name,',
            '  new InsightsLimitError(1).name,',
            '  new InsightsReadOnlyError().name,',
            '];',
        ].join('\n');
        const productionContext = {};
        vm.runInNewContext(bundledProbe(diagnosticProbe, false), productionContext);
        assert.deepEqual(Array.from(productionContext.__diagnosticNames), [
            'InsightsError',
            'CorruptInsightsStateError',
            'FutureInsightsSchemaError',
            'InsightsLimitError',
            'InsightsReadOnlyError',
        ]);
    });

    it('accepts byte-budget overrides and rejects every invalid raw/gzip policy value', (t) => {
        const fixture = createSourceFixture(t);
        const result = buildUserscript({
            rootDir: fixture,
            outputDir: temporaryDirectory(t),
            sizeBudgets: {
                userscriptGzipBytes: 10_000,
                userscriptRawBytes: 10_000,
            },
            buildSyncImpl: successfulFakeBuild,
        });
        assert.equal(result.artifact.budgetBytes, 10_000);
        assert.equal(result.artifact.gzipBudgetBytes, 10_000);

        for (const sizeBudgets of [null, '835000', [], true]) {
            assert.throws(
                () => buildUserscript({ sizeBudgets }),
                /sizeBudgets must be an object or false/,
            );
        }
        for (const name of Object.keys(DEFAULT_ARTIFACT_SIZE_BUDGETS)) {
            for (const value of [0, -1, 1.5, Infinity, '835000', null]) {
                assert.throws(
                    () => buildUserscript({ sizeBudgets: { [name]: value } }),
                    new RegExp(`${name} must be a positive integer byte count`),
                );
            }
        }
        assert.throws(() => buildUserscript({ minify: 'true' }), /minify must be a boolean/);
    });
});

describe('source and artifact validation', () => {
    it('accepts escaped versions and rejects every malformed userscript boundary', (t) => {
        const base = temporaryDirectory(t);
        const file = path.join(base, 'script.user.js');
        writeValidUserscript(file, '12.0+fixture');
        validateUserscript(file, '12.0+fixture');

        const invalid = [
            ['', /no complete metadata header/],
            ['// ==UserScript==\n// @version 12.0\nbody', /no complete metadata header/],
            ['prefix\n// ==/UserScript==\nbody', /no complete metadata header/],
            ['// ==UserScript==\n// @name Primer (v12.0)\n// @version 11.0\n// ==/UserScript==\nbody', /does not declare version 12\.0/],
            ['// ==UserScript==\n// @name Primer\n// @version 12.0\n// ==/UserScript==\nbody', /output name does not declare version 12\.0/],
            ['// ==UserScript==\n// @name Primer (v12.0)\n// @version 12.0\n// ==/UserScript==', /header but no bundle/],
        ];
        for (const [source, expected] of invalid) {
            fs.writeFileSync(file, source, 'utf8');
            assert.throws(() => validateUserscript(file, '12.0'), expected);
        }
    });

    it('reads the version contract and rejects missing metadata, invalid manifests, and drift', (t) => {
        const fixture = createSourceFixture(t);
        assert.equal(readSourceContract(fixture).version, '12.0');
        const meta = path.join(fixture, 'src', 'meta.txt');
        const manifestFile = path.join(fixture, 'src', 'platforms', 'extension', 'manifest.json');

        fs.writeFileSync(meta, '// ==UserScript==\n// ==/UserScript==', 'utf8');
        assert.throws(() => readSourceContract(fixture), /metadata is missing @version/);

        fs.writeFileSync(meta, '// @version 12.0', 'utf8');
        fs.writeFileSync(manifestFile, '{bad json', 'utf8');
        assert.throws(() => readSourceContract(fixture), /Invalid extension manifest/);

        fs.writeFileSync(manifestFile, JSON.stringify({ version: '13.0' }), 'utf8');
        assert.throws(() => readSourceContract(fixture), /extension is 13\.0/);
        fs.writeFileSync(manifestFile, '{}', 'utf8');
        assert.throws(() => readSourceContract(fixture), /extension is missing/);
    });

    it('rejects every extension manifest and referenced-artifact failure mode', (t) => {
        const run = (mutate, expected) => {
            const directory = createValidExtension(t);
            mutate(directory);
            assert.throws(() => validateExtension(directory, '12.0'), expected);
        };

        validateExtension(createValidExtension(t), '12.0');
        run(directory => fs.writeFileSync(path.join(directory, 'manifest.json'), '{bad', 'utf8'), /manifest is invalid/);
        run(directory => {
            const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
            manifest.manifest_version = 2;
            fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest));
        }, /manifest version 3/);
        run(directory => {
            const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
            delete manifest.version;
            fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest));
        }, /version missing does not match/);
        run(directory => {
            const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
            manifest.content_scripts = null;
            fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest));
        }, /no content scripts/);
        run(directory => {
            const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
            manifest.content_scripts = [];
            fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest));
        }, /no content scripts/);
        run(directory => {
            const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
            manifest.content_scripts = [{}];
            fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest));
        }, /content script has no JavaScript entry/);
        run(directory => {
            const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
            manifest.content_scripts[0].js = [];
            fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest));
        }, /content script has no JavaScript entry/);
        run(directory => {
            const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
            delete manifest.background;
            fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest));
        }, /no background service worker/);
        run(directory => {
            const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
            manifest.background = {};
            fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest));
        }, /no background service worker/);
        run(directory => {
            const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
            manifest.background.scripts = [];
            fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest));
        }, /no Firefox background script fallback/);
        run(directory => {
            const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
            delete manifest.icons;
            fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest));
        }, /no icons/);
        run(directory => {
            const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
            manifest.icons = {};
            fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest));
        }, /no icons/);
        run(directory => fs.rmSync(path.join(directory, 'background.js')), /artifact is missing: background\.js/);
        run(directory => {
            fs.rmSync(path.join(directory, 'background.js'));
            fs.mkdirSync(path.join(directory, 'background.js'));
        }, /artifact is missing: background\.js/);
        run(directory => fs.writeFileSync(path.join(directory, 'background.js'), ''), /artifact is empty: background\.js/);

        for (const relativePath of [null, '', path.resolve('/absolute.js'), '../escape.js']) {
            run(directory => {
                const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
                manifest.content_scripts[0].js = [relativePath];
                fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest));
            }, relativePath === '../escape.js' ? /escapes the extension directory/ : /invalid artifact path/);
        }

        run(directory => fs.writeFileSync(path.join(directory, 'content.js'), 'not wrapped', 'utf8'), /no awaited GM_\* initialization/);
        run(directory => fs.writeFileSync(path.join(directory, 'content.js'), '(async () => {\n// --- Main Application ---\n})();', 'utf8'), /no awaited GM_\* initialization/);
        run(directory => fs.writeFileSync(
            path.join(directory, 'content.js'),
            '(async () => {\n// --- Main Application ---\nawait globalThis.__initGMPolyfill();\n})();',
            'utf8',
        ), /starts the application before GM_\* initialization/);
    });
});

describe('bundle preparation and default destinations', () => {
    it('rejects every invalid bundler result and removes its staging workspace', (t) => {
        const base = temporaryDirectory(t);
        const cases = [
            [null, /bundle reported errors/],
            [{ errors: [new Error('bundle')] }, /bundle reported errors/],
            [{}, /did not produce exactly one output file/],
            [{ errors: [], outputFiles: [] }, /did not produce exactly one output file/],
            [{ errors: [], outputFiles: [
                { contents: Buffer.from('one') },
                { contents: Buffer.from('two') },
            ] }, /did not produce exactly one output file/],
            [bundleResult('not a userscript'), /no complete metadata header/],
        ];

        for (const [result, expected] of cases) {
            const outputDir = fs.mkdtempSync(path.join(base, 'case-'));
            assert.throws(() => buildUserscript({
                rootDir: root,
                outputDir,
                buildSyncImpl() { return result; },
            }), expected);
            assertNoTransactionDebris(outputDir);
        }

        const outputDir = fs.mkdtempSync(path.join(base, 'throw-'));
        assert.throws(() => buildUserscript({
            rootDir: root,
            outputDir,
            buildSyncImpl() { throw new Error('bundler threw'); },
        }), /bundler threw/);
        assertNoTransactionDebris(outputDir);
    });

    it('uses each default root and output destination without touching the repository artifacts', (t) => {
        const userscriptRoot = createSourceFixture(t);
        const userscript = buildUserscript({ rootDir: userscriptRoot, buildSyncImpl: successfulFakeBuild });
        assert.equal(userscript.outputFile, path.join(userscriptRoot, 'primer-pp.user.js'));

        const extensionRoot = createSourceFixture(t);
        const extension = buildExtension({ rootDir: extensionRoot, buildSyncImpl: successfulFakeBuild });
        assert.equal(extension.outputDir, path.join(extensionRoot, 'dist', 'extension'));

        const allRoot = createSourceFixture(t, { icons: false });
        const all = buildAll({ rootDir: allRoot, buildSyncImpl: successfulFakeBuild });
        assert.equal(all.userscript.outputFile, path.join(allRoot, 'primer-pp.user.js'));
        assert.equal(all.extension.outputDir, path.join(allRoot, 'dist', 'extension'));

        const defaultRootOutput = temporaryDirectory(t);
        const fromDefaultRoot = buildUserscript({
            outputDir: defaultRootOutput,
            buildSyncImpl: successfulFakeBuild,
        });
        assert.equal(fromDefaultRoot.outputFile, path.join(defaultRootOutput, 'primer-pp.user.js'));
    });

    it('cleans standalone staging workspaces even when final publication fails', (t) => {
        for (const kind of ['userscript', 'extension']) {
            const base = temporaryDirectory(t);
            const outputDir = path.join(base, kind);
            const publishDestination = kind === 'userscript'
                ? path.join(outputDir, 'primer-pp.user.js')
                : outputDir;
            let failed = false;
            const fsImpl = fsWith({
                renameSync(source, destination) {
                    if (!failed && source.includes(STAGE_PREFIX) && destination === publishDestination) {
                        failed = true;
                        throw new Error(`${kind} publish failed`);
                    }
                    return fs.renameSync(source, destination);
                },
            });
            const build = kind === 'userscript' ? buildUserscript : buildExtension;
            assert.throws(() => build({
                rootDir: root,
                outputDir,
                fsImpl,
                buildSyncImpl: successfulFakeBuild,
            }), new RegExp(`${kind} publish failed`));
            assert.equal(failed, true);
            assertNoTransactionDebris(base);
        }
    });
});

describe('commit transport and rollback', () => {
    it('falls back from EXDEV rename to file and directory copies', (t) => {
        for (const type of ['file', 'directory']) {
            const { artifact } = createCommitArtifact(t, { name: `artifact-${type}`, type });
            const fsImpl = fsWith({
                renameSync(source, destination) {
                    if (source === artifact.stagedPath && destination === artifact.destination) throw exdev();
                    return fs.renameSync(source, destination);
                },
            });

            commitArtifacts([artifact], fsImpl);
            assert.equal(fs.existsSync(artifact.stagedPath), false);
            if (type === 'directory') {
                assert.equal(fs.readFileSync(path.join(artifact.destination, 'new.txt'), 'utf8'), 'new');
            } else {
                assert.equal(fs.readFileSync(artifact.destination, 'utf8'), 'new');
            }
        }
    });

    it('supports EXDEV backup moves and removes the successful backup', (t) => {
        const { artifact, base } = createCommitArtifact(t, { name: 'artifact.txt', existing: 'old' });
        let backupFallback = false;
        const fsImpl = fsWith({
            renameSync(source, destination) {
                if (!backupFallback && source === artifact.destination && destination.includes(BACKUP_PREFIX)) {
                    backupFallback = true;
                    throw exdev('backup crossed devices');
                }
                return fs.renameSync(source, destination);
            },
        });

        commitArtifacts([artifact], fsImpl);
        assert.equal(backupFallback, true);
        assert.equal(fs.readFileSync(artifact.destination, 'utf8'), 'new');
        assert.equal(fs.readdirSync(base).some(name => name.startsWith(BACKUP_PREFIX)), false);
    });

    it('restores an earlier artifact through EXDEV when a later install fails', (t) => {
        const first = createCommitArtifact(t, { name: 'first.txt', existing: 'old-first' }).artifact;
        const second = createCommitArtifact(t, { name: 'second.txt' }).artifact;
        let restoreFallback = false;
        const fsImpl = fsWith({
            renameSync(source, destination) {
                if (source === second.stagedPath) throw new Error('second install failed');
                if (source.includes(BACKUP_PREFIX) && destination === first.destination) {
                    restoreFallback = true;
                    throw exdev('restore crossed devices');
                }
                return fs.renameSync(source, destination);
            },
        });

        assert.throws(() => commitArtifacts([first, second], fsImpl), /second install failed/);
        assert.equal(restoreFallback, true);
        assert.equal(fs.readFileSync(first.destination, 'utf8'), 'old-first');
        assert.equal(fs.existsSync(second.destination), false);
    });

    it('cleans partial EXDEV copies and preserves the original copy failure', (t) => {
        const { artifact } = createCommitArtifact(t, { name: 'copy-failure.txt' });
        const expected = new Error('copy failed after partial output');
        const fsImpl = fsWith({
            renameSync() { throw exdev(); },
            copyFileSync(source, destination) {
                fs.copyFileSync(source, destination);
                throw expected;
            },
        });

        assert.throws(() => commitArtifacts([artifact], fsImpl), error => error === expected);
        assert.equal(fs.existsSync(artifact.destination), false);
        assert.equal(fs.existsSync(artifact.stagedPath), true);
    });

    it('attaches cleanup failures without replacing the EXDEV copy failure', (t) => {
        const { artifact } = createCommitArtifact(t, { name: 'cleanup-failure.txt' });
        const expected = new Error('copy failed');
        const cleanup = new Error('partial destination cleanup failed');
        const fsImpl = fsWith({
            renameSync() { throw exdev(); },
            copyFileSync(source, destination) {
                fs.copyFileSync(source, destination);
                throw expected;
            },
            rmSync(target, options) {
                if (target === artifact.destination) throw cleanup;
                return fs.rmSync(target, options);
            },
        });

        assert.throws(
            () => commitArtifacts([artifact], fsImpl),
            error => error === expected && error.cleanupError === cleanup,
        );
    });

    it('removes an EXDEV destination copy when deleting the source fails', (t) => {
        const { artifact } = createCommitArtifact(t, { name: 'source-remove-failure.txt' });
        const expected = new Error('source removal failed');
        const fsImpl = fsWith({
            renameSync() { throw exdev(); },
            rmSync(target, options) {
                if (target === artifact.stagedPath) throw expected;
                return fs.rmSync(target, options);
            },
        });

        assert.throws(() => commitArtifacts([artifact], fsImpl), error => error === expected);
        assert.equal(fs.existsSync(artifact.destination), false);
        assert.equal(fs.existsSync(artifact.stagedPath), true);
    });

    it('cleans the backup workspace if moving the previous artifact fails', (t) => {
        const { artifact, base } = createCommitArtifact(t, { name: 'backup-failure.txt', existing: 'old' });
        const fsImpl = fsWith({
            renameSync(source, destination) {
                if (source === artifact.destination && destination.includes(BACKUP_PREFIX)) {
                    throw new Error('backup move failed');
                }
                return fs.renameSync(source, destination);
            },
        });

        assert.throws(() => commitArtifacts([artifact], fsImpl), /backup move failed/);
        assert.equal(fs.readFileSync(artifact.destination, 'utf8'), 'old');
        assert.equal(fs.readdirSync(base).some(name => name.startsWith(BACKUP_PREFIX)), false);
    });

    it('preserves a recoverable backup and reports a restore failure', (t) => {
        const first = createCommitArtifact(t, { name: 'first.txt', existing: 'old-first' }).artifact;
        const second = createCommitArtifact(t, { name: 'second.txt' }).artifact;
        let backupPath = null;
        const fsImpl = fsWith({
            renameSync(source, destination) {
                if (source === first.destination && destination.includes(BACKUP_PREFIX)) {
                    backupPath = destination;
                }
                if (source === second.stagedPath) throw new Error('second failed');
                if (backupPath && source === backupPath && destination === first.destination) {
                    throw new Error('restore failed');
                }
                return fs.renameSync(source, destination);
            },
        });

        assert.throws(
            () => commitArtifacts([first, second], fsImpl),
            error => /second failed/.test(error.message)
                && /restore failed/.test(error.message)
                && /previous artifact preserved at/.test(error.message),
        );
        assert.ok(backupPath && fs.existsSync(backupPath));
        assert.equal(fs.readFileSync(backupPath, 'utf8'), 'old-first');
    });

    it('reports rollback failure when no previous artifact exists', (t) => {
        const first = createCommitArtifact(t, { name: 'first.txt' }).artifact;
        const second = createCommitArtifact(t, { name: 'second.txt' }).artifact;
        const fsImpl = fsWith({
            renameSync(source, destination) {
                if (source === second.stagedPath) throw new Error('second failed');
                return fs.renameSync(source, destination);
            },
            rmSync(target, options) {
                if (target === first.destination) throw new Error('new artifact removal failed');
                return fs.rmSync(target, options);
            },
        });

        assert.throws(
            () => commitArtifacts([first, second], fsImpl),
            error => /second failed/.test(error.message) && /new artifact removal failed/.test(error.message),
        );
    });
});
