function normalizeMicDeviceId(value) {
  const deviceId = String(value || '').trim();
  const alias = deviceId.toLowerCase();
  return alias === 'default' || alias === 'communications' ? '' : deviceId;
}

function selectableMicrophones(devices) {
  const seen = new Set();
  return (devices || []).filter((device) => {
    if (device.kind !== 'audioinput') return false;
    const deviceId = normalizeMicDeviceId(device.deviceId);
    if (!deviceId || seen.has(deviceId)) return false;
    seen.add(deviceId);
    return true;
  });
}

function withSelectedMicrophone(baseConstraints, deviceId) {
  const normalizedId = normalizeMicDeviceId(deviceId);
  const constraints = { ...baseConstraints };
  if (normalizedId) constraints.deviceId = { exact: normalizedId };
  return constraints;
}

const microphoneDevices = {
  normalizeMicDeviceId,
  selectableMicrophones,
  withSelectedMicrophone,
};

if (typeof module !== 'undefined' && module.exports) module.exports = microphoneDevices;
if (typeof window !== 'undefined') window.microphoneDevices = microphoneDevices;
