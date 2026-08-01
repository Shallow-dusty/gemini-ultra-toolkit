function assertRegistry(registry) {
    if (!registry || typeof registry.register !== 'function') {
        throw new TypeError('Module catalog requires a registry with register()');
    }
}

/**
 * Freeze the explicit legacy module order owned by the composition root.
 * Registration stays deterministic and duplicate ids fail before mutating the
 * registry, rather than being discovered halfway through application start.
 */
export function createModuleCatalog(modules) {
    if (!Array.isArray(modules)) throw new TypeError('Module catalog must be an array');

    const ids = new Set();
    const catalog = modules.map(module => {
        if (!module || typeof module !== 'object' || typeof module.id !== 'string' || !module.id) {
            throw new TypeError('Every module catalog entry must have an id');
        }
        if (ids.has(module.id)) throw new Error(`Duplicate module catalog id: ${module.id}`);
        ids.add(module.id);
        return module;
    });
    return Object.freeze(catalog);
}

export function registerModuleCatalog(registry, catalog) {
    assertRegistry(registry);
    if (!Array.isArray(catalog)) throw new TypeError('Registered module catalog must be an array');
    for (const module of catalog) registry.register(module);
    return registry;
}
