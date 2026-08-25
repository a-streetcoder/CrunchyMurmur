const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeMicDeviceId,
  selectableMicrophones,
  withSelectedMicrophone,
} = require('../ui/microphone-devices');

test('system microphone aliases are not presented as physical devices', () => {
  const devices = [
    { kind: 'audioinput', deviceId: 'default', label: 'Microphone Array', groupId: 'group-a' },
    { kind: 'audioinput', deviceId: 'communications', label: 'Microphone Array', groupId: 'group-a' },
    { kind: 'audioinput', deviceId: 'physical-mic-a', label: 'Microphone Array', groupId: 'group-a' },
    { kind: 'audioinput', deviceId: 'physical-mic-b', label: 'USB Microphone', groupId: 'group-b' },
    { kind: 'audiooutput', deviceId: 'speaker-a', label: 'Speakers', groupId: 'group-c' },
  ];

  assert.deepEqual(
    selectableMicrophones(devices).map((device) => device.deviceId),
    ['physical-mic-a', 'physical-mic-b'],
  );
});

test('legacy Windows aliases migrate to the system-default preference', () => {
  assert.equal(normalizeMicDeviceId('default'), '');
  assert.equal(normalizeMicDeviceId('communications'), '');
  assert.equal(normalizeMicDeviceId(' physical-mic-a '), 'physical-mic-a');
});

test('only a physical microphone receives an exact device constraint', () => {
  const base = { channelCount: 1, echoCancellation: false };

  assert.deepEqual(withSelectedMicrophone(base, 'default'), base);
  assert.deepEqual(withSelectedMicrophone(base, ''), base);
  assert.deepEqual(withSelectedMicrophone(base, 'physical-mic-a'), {
    channelCount: 1,
    echoCancellation: false,
    deviceId: { exact: 'physical-mic-a' },
  });
  assert.equal(Object.hasOwn(base, 'deviceId'), false, 'the base constraints must not be mutated');
});
