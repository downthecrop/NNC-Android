import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useAuth } from '@/lib/auth';
import { Redirect } from 'expo-router';

export default function LoginScreen() {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];
  const { signIn, devMode, isAuthenticated } = useAuth();
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError('');
    setLoading(true);
    const result = await signIn(user.trim(), pass);
    setLoading(false);
    if (!result.ok) {
      setError(result.error || 'Login failed');
    } else {
      setPass('');
    }
  };

  if (devMode || isAuthenticated) {
    return <Redirect href="/(tabs)/files" />;
  }

  const cardBackground = colorScheme === 'dark' ? '#171A20' : '#FFFFFF';
  const inputBackground = colorScheme === 'dark' ? '#1F232B' : '#F9FAFB';
  const inputBorder = colorScheme === 'dark' ? '#2B303A' : '#E1E4EA';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <View style={[styles.card, { backgroundColor: cardBackground }]}>
          <View style={styles.brand}>
            <Text style={[styles.brandTitle, { color: palette.text }]}>Local Cloud</Text>
            <Text style={styles.brandSubtitle}>Sign in to your personal server</Text>
          </View>
          <TextInput
            value={user}
            onChangeText={setUser}
            placeholder="Username"
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.input, { color: palette.text, backgroundColor: inputBackground, borderColor: inputBorder }]}
            placeholderTextColor="#8A8F98"
          />
          <TextInput
            value={pass}
            onChangeText={setPass}
            placeholder="Password"
            secureTextEntry
            style={[styles.input, { color: palette.text, backgroundColor: inputBackground, borderColor: inputBorder }]}
            placeholderTextColor="#8A8F98"
          />
          <Pressable style={[styles.button, { backgroundColor: palette.tint }]} onPress={handleSubmit}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Sign In</Text>
            )}
          </Pressable>
          {Boolean(error) && <Text style={styles.error}>{error}</Text>}
          {devMode && (
            <Text style={styles.devNote}>Dev mode is enabled on the server.</Text>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    padding: 24,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  brand: {
    marginBottom: 20,
  },
  brandTitle: {
    fontSize: 26,
    fontWeight: '700',
  },
  brandSubtitle: {
    marginTop: 6,
    color: '#6B717C',
    fontSize: 14,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E1E4EA',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    fontSize: 16,
    backgroundColor: '#F9FAFB',
  },
  button: {
    marginTop: 4,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    marginTop: 12,
    color: '#C03D3D',
    fontSize: 13,
  },
  devNote: {
    marginTop: 8,
    color: '#6B717C',
    fontSize: 12,
  },
});
