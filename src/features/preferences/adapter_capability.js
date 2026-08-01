export function getAdapterCapabilityStatus(adapter, id) {
    const report = adapter.getCapabilityProbeReport();
    return report?.adapterCapabilities?.find(record => record.id === id)?.status || 'unavailable';
}
