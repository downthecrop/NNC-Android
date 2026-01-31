import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { API_BASE_URL } from '@/lib/config';
import { useAuth } from '@/lib/auth';
import { useServer } from '@/lib/server';
import { formatDate } from '@/lib/format';

export default function SettingsScreen() {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];
  const { signOut } = useAuth();
  const { info, status } = useServer();

  const cardBackground = colorScheme === 'dark' ? '#171A20' : '#FFFFFF';
  const metaColor = colorScheme === 'dark' ? '#9AA3B2' : '#7D8390';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}> 
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={[styles.title, { color: palette.text }]}>Settings</Text>
        <View style={[styles.card, { backgroundColor: cardBackground }]}> 
          <Text style={styles.sectionTitle}>Server</Text>
          <Text style={[styles.label, { color: metaColor }]}>Base URL</Text>
          <Text style={[styles.value, { color: palette.text }]}>{API_BASE_URL}</Text>
          <Text style={[styles.label, { color: metaColor }]}>API Version</Text>
          <Text style={[styles.value, { color: palette.text }]}>
            {info?.apiVersion ?? '—'}
          </Text>
          <Text style={[styles.label, { color: metaColor }]}>Server Version</Text>
          <Text style={[styles.value, { color: palette.text }]}>
            {info?.serverVersion ?? '—'}
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: cardBackground }]}> 
          <Text style={styles.sectionTitle}>Indexer</Text>
          <Text style={[styles.label, { color: metaColor }]}>Last Scan</Text>
          <Text style={[styles.value, { color: palette.text }]}>
            {formatDate(status?.lastScanAt || null)}
          </Text>
          <Text style={[styles.label, { color: metaColor }]}>Status</Text>
          <Text style={[styles.value, { color: palette.text }]}>
            {status?.scanInProgress ? 'Running' : 'Idle'}
          </Text>
        </View>

        <Pressable style={[styles.signOut, { backgroundColor: palette.tint }]} onPress={signOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  container: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 16,
  },
  card: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#7D8390',
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    marginTop: 6,
  },
  value: {
    fontSize: 15,
    fontWeight: '600',
  },
  signOut: {
    marginTop: 12,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  signOutText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
});
