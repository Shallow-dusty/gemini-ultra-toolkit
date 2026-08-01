/** Move focus within a bounded, wrapping set of semantic controls. */
export function moveRovingFocus(event, buttons, activeElement, { nextKey, previousKey }) {
    const nextKeys = Array.isArray(nextKey) ? nextKey : [nextKey];
    const previousKeys = Array.isArray(previousKey) ? previousKey : [previousKey];
    if (!['Home', 'End', ...nextKeys, ...previousKeys].includes(event.key)) return false;
    if (buttons.length === 0) return false;
    const current = buttons.indexOf(activeElement);
    let index = current;
    if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = buttons.length - 1;
    else if (nextKeys.includes(event.key)) index = current < 0 ? 0 : (current + 1) % buttons.length;
    else index = current < 0 ? buttons.length - 1 : (current - 1 + buttons.length) % buttons.length;
    event.preventDefault();
    buttons[index].focus();
    return true;
}
