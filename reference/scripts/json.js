// JSON with arrays of plain values kept on one line, for readable vector files.
export function stringify(value, indent = '') {
  const next = indent + '  ';
  if (Array.isArray(value)) {
    if (value.every((v) => v === null || typeof v !== 'object')) {
      return JSON.stringify(value).replace(/","/g, '", "').replace(/,(?=[0-9-])/g, ', ');
    }
    return `[\n${value.map((v) => next + stringify(v, next)).join(',\n')}\n${indent}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return '{}';
    return `{\n${entries.map(([k, v]) => `${next}${JSON.stringify(k)}: ${stringify(v, next)}`).join(',\n')}\n${indent}}`;
  }
  return JSON.stringify(value);
}
