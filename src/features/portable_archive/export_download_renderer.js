import { exportCSV, exportMarkdown } from '../../../lib/export_formatter.js';
import {
    exportBulkTranscriptCSV,
    exportBulkTranscriptDOCX,
    exportBulkTranscriptHTML,
    exportBulkTranscriptJSON,
    exportBulkTranscriptMarkdown,
    exportBulkTranscriptText,
    exportTranscriptCSV,
    exportTranscriptDOCX,
    exportTranscriptHTML,
    exportTranscriptJSON,
    exportTranscriptMarkdown,
    exportTranscriptText
} from '../../../lib/chat_transcript_export.js';

export const LEGACY_DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const LEGACY_EXPORT_FORMATS = Object.freeze(['json', 'csv', 'markdown', 'text', 'html', 'docx']);

export function renderUsageCSV(snapshot) {
    return exportCSV(snapshot.dailyCounts);
}

export function renderUsageMarkdown(snapshot, metadata, streaks) {
    return exportMarkdown(snapshot.dailyCounts, {
        user: metadata.user,
        total: snapshot.total,
        totalChatsCreated: snapshot.totalChatsCreated,
        currentStreak: streaks.current,
        bestStreak: streaks.best
    });
}

function currentFormatSpec(format, prefix) {
    const specs = {
        json: [exportTranscriptJSON, `${prefix}.chat.json`, 'application/json'],
        csv: [exportTranscriptCSV, `${prefix}.chat.csv`, 'text/csv'],
        markdown: [exportTranscriptMarkdown, `${prefix}.chat.md`, 'text/markdown'],
        html: [exportTranscriptHTML, `${prefix}.chat.html`, 'text/html'],
        docx: [exportTranscriptDOCX, `${prefix}.chat.docx`, LEGACY_DOCX_MIME],
        text: [exportTranscriptText, `${prefix}.chat.txt`, 'text/plain']
    };
    return specs[format] || specs.text;
}

function bulkFormatSpec(format, prefix) {
    const specs = {
        json: [exportBulkTranscriptJSON, `${prefix}.json`, 'application/json'],
        csv: [exportBulkTranscriptCSV, `${prefix}.csv`, 'text/csv'],
        markdown: [exportBulkTranscriptMarkdown, `${prefix}.md`, 'text/markdown'],
        html: [exportBulkTranscriptHTML, `${prefix}.html`, 'text/html'],
        docx: [exportBulkTranscriptDOCX, `${prefix}.docx`, LEGACY_DOCX_MIME],
        text: [exportBulkTranscriptText, `${prefix}.txt`, 'text/plain']
    };
    return specs[format] || specs.text;
}

function render(spec, value) {
    const [formatter, filename, type] = spec;
    return { content: formatter(value), filename, type };
}

export function renderCurrentTranscriptDownload(format, transcript, prefix) {
    return render(currentFormatSpec(format, prefix), transcript);
}

export function renderBulkTranscriptDownload(format, bulkExport, prefix) {
    return render(bulkFormatSpec(format, prefix), bulkExport);
}
