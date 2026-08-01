export function appendTextElement(documentRef, parent, tagName, text, className = '') {
    const element = documentRef.createElement(tagName);
    if (className) element.className = className;
    element.textContent = text;
    parent.appendChild(element);
    return element;
}

export function appendDefinition(documentRef, list, term, description) {
    appendTextElement(documentRef, list, 'dt', term);
    appendTextElement(documentRef, list, 'dd', String(description));
}
