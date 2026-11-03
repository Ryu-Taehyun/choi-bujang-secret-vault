const namedDeviceItems = new Set(['deviceKey', 'devicePrivateKey', 'privateKey',
  'vault.deviceKey', 'vault.devicePrivateKey', 'aleph.deviceKey', 'aleph-device-private-key']);
export function clearLegacyStorage(storage) {
  if (!storage) return;
  const names = [];
  for (let i = 0; i < storage.length; i += 1) names.push(storage.key(i));
  for (const name of names) {
    if (typeof name === 'string' && (namedDeviceItems.has(name)
        || /^sb-[a-z0-9]+-auth-token(?:-code-verifier)?$/iu.test(name))) storage.removeItem(name);
  }
}
export function clearBrowserLegacyStorage(browser = window) {
  // Inspect names only. Never read, print, migrate or submit old secret values.
  for (const name of ['localStorage', 'sessionStorage']) clearLegacyStorage(browser[name]);
}
