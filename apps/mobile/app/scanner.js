import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
  ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { PairingPayloadSchema } from '@ag-remote/shared';
import { useTheme } from '../src/theme.js';
import Icon from '../src/components/Icon.js';
import { saveProfile, setActiveProfileId } from '../src/storage.js';
import { checkHealth } from '../src/api.js';

export default function ScannerScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [manualJson, setManualJson] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const processPairingString = async (rawString) => {
    try {
      setIsProcessing(true);
      const parsed = JSON.parse(rawString);
      const validated = PairingPayloadSchema.safeParse(parsed);
      if (!validated.success) {
        Alert.alert('Invalid QR Code', 'The scanned QR code is not an AG Remote pairing payload.');
        setIsProcessing(false);
        setScanned(false);
        return;
      }

      const { baseUrl, token, ntfyTopic } = validated.data;
      const cleanUrl = baseUrl.replace(/\/+$/, '');
      const healthCheck = await checkHealth(cleanUrl, 4000);
      const name = healthCheck.health?.hostname
        ? `${healthCheck.health.hostname} (${healthCheck.health.hostOs})`
        : cleanUrl;

      const profileId = `profile_${Date.now()}`;
      const newProfile = {
        id: profileId,
        name,
        baseUrl: cleanUrl,
        token,
        ntfyTopic: ntfyTopic || '',
        updatedAt: new Date().toISOString()
      };

      await saveProfile(newProfile);
      await setActiveProfileId(profileId);

      Alert.alert(
        'Bridge Paired Successfully',
        `Connected to ${name} (${healthCheck.reachable ? 'Online' : 'Pending'}).`,
        [
          {
            text: 'Done',
            onPress: () => router.back()
          }
        ]
      );
    } catch {
      Alert.alert('Error', 'Failed to parse payload. Ensure it is valid JSON.');
      setScanned(false);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBarcodeScanned = ({ data }) => {
    if (scanned || isProcessing) {
      return;
    }
    setScanned(true);
    processPairingString(data);
  };

  const handleManualSubmit = () => {
    if (!manualJson.trim()) {
      return;
    }
    processPairingString(manualJson.trim());
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {Platform.OS !== 'web' && permission?.granted ? (
        <View style={styles.cameraContainer}>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ['qr']
            }}
            onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
          />
          <View style={styles.overlay}>
            <View style={styles.targetBox}>
              <View style={[styles.corner, styles.cornerTL, { borderColor: theme.accent }]} />
              <View style={[styles.corner, styles.cornerTR, { borderColor: theme.accent }]} />
              <View style={[styles.corner, styles.cornerBL, { borderColor: theme.accent }]} />
              <View style={[styles.corner, styles.cornerBR, { borderColor: theme.accent }]} />
            </View>
            <Text style={[styles.scanPrompt, { color: '#ffffff' }]}>
              Align AG Remote QR code inside the box
            </Text>
          </View>
        </View>
      ) : (
        <View style={[styles.permissionCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Icon name="monitor" size={44} color={theme.muted} />
          <Text style={[styles.permissionTitle, { color: theme.text }]}>Camera Access</Text>
          <Text style={[styles.permissionSub, { color: theme.muted }]}>
            Camera is required to scan pairing QR codes. You can also paste the JSON payload below.
          </Text>
          {Platform.OS !== 'web' && (
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: theme.accent }]}
              onPress={requestPermission}
            >
              <Text style={styles.primaryBtnText}>Enable Camera</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <View style={[styles.manualSection, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.manualLabel, { color: theme.muted }]}>
          OR PASTE PAIRING JSON DIRECTLY
        </Text>
        <TextInput
          style={[styles.manualInput, { backgroundColor: theme.raised, borderColor: theme.border, color: theme.text }]}
          placeholder='{"baseUrl":"http://100...","token":"...","ntfyTopic":"..."}'
          placeholderTextColor={theme.subtle}
          multiline
          numberOfLines={3}
          value={manualJson}
          onChangeText={setManualJson}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity
          style={[styles.submitBtn, { backgroundColor: theme.accent }]}
          onPress={handleManualSubmit}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.submitBtnText}>Pair With JSON</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const fontRegular = Platform.select({
  ios: 'Poppins-Regular',
  android: 'Poppins_400Regular',
  web: 'Poppins, sans-serif',
  default: 'System'
});

const fontBold = Platform.select({
  ios: 'Poppins-Bold',
  android: 'Poppins_700Bold',
  web: 'Poppins, sans-serif',
  default: 'System'
});

const fontSemiBold = Platform.select({
  ios: 'Poppins-SemiBold',
  android: 'Poppins_600SemiBold',
  web: 'Poppins, sans-serif',
  default: 'System'
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16
  },
  cameraContainer: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative'
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  targetBox: {
    width: 240,
    height: 240,
    position: 'relative',
    backgroundColor: 'transparent'
  },
  corner: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderWidth: 3
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0
  },
  scanPrompt: {
    marginTop: 24,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5
  },
  permissionCard: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  permissionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 12
  },
  permissionSub: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
    maxWidth: 280
  },
  primaryBtn: {
    marginTop: 18,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600'
  },
  manualSection: {
    marginTop: 16,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1
  },
  manualLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.8,
    marginBottom: 8
  },
  manualInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 12,
    minHeight: 70,
    textAlignVertical: 'top'
  },
  submitBtn: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600'
  }
});
