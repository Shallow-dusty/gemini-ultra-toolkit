const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    detectToolModeLabel,
    getToolModeState,
    isActiveToolModeState
} = require('../lib/tool_mode_tools.js');

describe('tool_mode_tools', () => {
    it('detects canonical Gemini tool labels from text', () => {
        assert.equal(detectToolModeLabel('Deep Research'), 'Deep Research');
        assert.equal(detectToolModeLabel('open Canvas mode'), 'Canvas');
        assert.equal(detectToolModeLabel('Gemini Spark agent'), 'Spark');
        assert.equal(detectToolModeLabel('Audio Overview'), 'Audio Overview');
        assert.equal(detectToolModeLabel('Create image with Imagen'), 'Image');
        assert.equal(detectToolModeLabel('Generate video with Veo'), 'Video');
    });

    it('detects localized labels and ignores unknown text', () => {
        assert.equal(detectToolModeLabel('深度研究'), 'Deep Research');
        assert.equal(detectToolModeLabel('画布'), 'Canvas');
        assert.equal(detectToolModeLabel('音訊總覽'), 'Audio Overview');
        assert.equal(detectToolModeLabel('图片生成'), 'Image');
        assert.equal(detectToolModeLabel('影片生成'), 'Video');
        assert.equal(detectToolModeLabel(''), '');
        assert.equal(detectToolModeLabel(null), '');
        assert.equal(detectToolModeLabel('ordinary chat'), '');
    });

    it('detects active state from aria/data attributes and classes', () => {
        assert.equal(isActiveToolModeState({ ariaPressed: 'true' }), true);
        assert.equal(isActiveToolModeState({ ariaCurrent: 'true' }), true);
        assert.equal(isActiveToolModeState({ dataActive: 'true' }), true);
        assert.equal(isActiveToolModeState({ classList: ['chip', 'selected'] }), true);
        assert.equal(isActiveToolModeState({ className: 'mode active' }), true);
        assert.equal(isActiveToolModeState({ className: 'inactive' }), false);
        assert.equal(isActiveToolModeState(null), false);
    });

    it('combines label and active state for automation guards', () => {
        assert.deepEqual(getToolModeState({
            text: 'Canvas',
            ariaPressed: 'true'
        }), {
            active: true,
            label: 'Canvas'
        });

        assert.deepEqual(getToolModeState({
            ariaLabel: 'Use Deep Research',
            className: 'selected'
        }), {
            active: true,
            label: 'Deep Research'
        });

        assert.deepEqual(getToolModeState({
            text: 'Canvas',
            className: ''
        }), {
            active: false,
            label: 'Canvas'
        });

        assert.deepEqual(getToolModeState({
            text: 'Plain chat',
            ariaPressed: 'true'
        }), {
            active: false,
            label: ''
        });
    });
});
