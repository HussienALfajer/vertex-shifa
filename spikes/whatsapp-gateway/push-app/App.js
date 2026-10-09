// Spike B push probe: shows this device's push tokens and every notification it receives, with delivery latency.
// Throwaway code; synthetic content only.
import { useEffect, useState } from 'react';
import { Platform, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

async function register(setInfo) {
  const info = { device: `${Device.manufacturer ?? ''} ${Device.modelName ?? ''} · ${Platform.OS} ${Device.osVersion ?? ''}`, projectId: projectId ?? 'none' };
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', { name: 'default', importance: Notifications.AndroidImportance.HIGH });
    }
    const { status } = await Notifications.requestPermissionsAsync();
    info.permission = status;
  } catch (e) { info.permissionError = String(e?.message ?? e); }
  const t0 = Date.now();
  try {
    const device = await Notifications.getDevicePushTokenAsync();
    info.deviceTokenType = device.type;
    info.deviceToken = String(device.data);
    info.deviceTokenMs = Date.now() - t0;
  } catch (e) { info.deviceTokenError = String(e?.message ?? e); }
  const t1 = Date.now();
  try {
    const expo = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    info.expoToken = expo.data;
    info.expoTokenMs = Date.now() - t1;
  } catch (e) { info.expoTokenError = String(e?.message ?? e); }
  setInfo(info);
}

export default function App() {
  const [info, setInfo] = useState({ status: 'registering…' });
  const [received, setReceived] = useState([]);

  useEffect(() => {
    register(setInfo);
    const onNotification = (n, via) => {
      const data = n.request.content.data ?? {};
      const at = Date.now();
      setReceived((list) => [{ via, at, title: n.request.content.title, path: data.path ?? '?', latencyMs: data.sentAt ? at - Number(data.sentAt) : null }, ...list]);
    };
    const a = Notifications.addNotificationReceivedListener((n) => onNotification(n, 'foreground'));
    const b = Notifications.addNotificationResponseReceivedListener((r) => onNotification(r.notification, 'tapped'));
    Notifications.getLastNotificationResponseAsync().then((r) => r && onNotification(r.notification, 'opened-app'));
    return () => { a.remove(); b.remove(); };
  }, []);

  const shareTokens = () => Share.share({ message: JSON.stringify({ device: info.device, deviceTokenType: info.deviceTokenType, deviceToken: info.deviceToken, expoToken: info.expoToken }) });
  const shareResults = () => Share.share({ message: JSON.stringify(received.map(({ at, ...r }) => ({ ...r, at: new Date(at).toISOString() }))) });

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.h1}>Vertex Shifa · Spike B push</Text>
        {Object.entries(info).map(([k, v]) => (
          <Text key={k} style={styles.row} selectable><Text style={styles.key}>{k}: </Text>{String(v)}</Text>
        ))}
        <TouchableOpacity style={styles.button} onPress={shareTokens}><Text style={styles.buttonText}>Share tokens</Text></TouchableOpacity>
        <Text style={styles.h2}>Received ({received.length})</Text>
        {received.map((r, i) => (
          <Text key={i} style={styles.row} selectable>{new Date(r.at).toISOString().slice(11, 19)} · {r.via} · {r.path} · {r.latencyMs ?? '?'} ms · {r.title}</Text>
        ))}
        <TouchableOpacity style={styles.button} onPress={shareResults}><Text style={styles.buttonText}>Share results</Text></TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff', paddingTop: 48 },
  body: { padding: 16, gap: 8 },
  h1: { fontSize: 18, fontWeight: '700' },
  h2: { fontSize: 16, fontWeight: '700', marginTop: 12 },
  row: { fontSize: 12, color: '#111' },
  key: { fontWeight: '700' },
  button: { backgroundColor: '#0b5', padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontWeight: '700' },
});
