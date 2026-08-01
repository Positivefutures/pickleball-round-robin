/**
 * Hands a generated file to the browser. Kept out of lib/ so the file-format
 * code stays free of DOM calls and testable on its own.
 */
export function downloadTextFile(fileName: string, text: string, mime = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  // Safari ignores a click on a link that was never in the document
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
