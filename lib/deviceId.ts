import AsyncStorage from '@react-native-async-storage/async-storage';

const DEVICE_ID_KEY = 'anonymous_device_id_v1';

let cachedDeviceId: string | null = null;

function generateId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 24; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `dev_${id}_${Date.now().toString(36)}`;
}

export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;

  try {
    const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (stored) {
      cachedDeviceId = stored;
      console.log('[DeviceId] Loaded:', stored);
      return stored;
    }
  } catch (e) {
    console.log('[DeviceId] Read error:', e);
  }

  const newId = generateId();
  cachedDeviceId = newId;

  try {
    await AsyncStorage.setItem(DEVICE_ID_KEY, newId);
    console.log('[DeviceId] Created:', newId);
  } catch (e) {
    console.log('[DeviceId] Save error:', e);
  }

  return newId;
}
