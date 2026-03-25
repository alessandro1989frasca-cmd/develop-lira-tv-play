import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Linking,
  Platform,
} from 'react-native';
import { Globe, Tv, ExternalLink, PlayCircle, Shield, Heart, Check, Copy, Fingerprint, Mail } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';

import Colors from '@/constants/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CONTACT_INFO } from '@/constants/config';
import { useUserPreferences, ALL_NEWS_CATEGORIES } from '@/providers/UserPreferencesProvider';
import { getDeviceId } from '@/lib/deviceId';

export default function InfoScreen() {
  const insets = useSafeAreaInsets();
  const { preferences, toggleCategory } = useUserPreferences();
  const [deviceId, setDeviceId] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getDeviceId().then(setDeviceId).catch(() => {});
  }, []);

  const handleCopyDeviceId = useCallback(async () => {
    if (!deviceId) return;
    try {
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(deviceId);
      } else {
        await Clipboard.setStringAsync(deviceId);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.log('[Info] Copy error:', e);
    }
  }, [deviceId]);

  const handleToggleCategory = useCallback((cat: string) => {
    toggleCategory(cat);
  }, [toggleCategory]);

  const handleWebsitePress = async () => {
    try {
      await Linking.openURL(CONTACT_INFO.website);
    } catch (error) {
      console.error('Error opening website:', error);
    }
  };

  const handlePrivacyPress = async () => {
    try {
      await Linking.openURL('https://www.liratv.it/privacy-policy/');
    } catch (error) {
      console.error('Error opening privacy policy:', error);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Image 
          source={require('@/assets/images/info-logo.png')} 
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.tagline}>#eseiprotagonista</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Chi Siamo</Text>
        <Text style={styles.sectionText}>
          Lira TV è un'emittente regionale della Campania, punto di riferimento per Salerno e provincia. Guarda la diretta streaming o i tuoi programmi preferiti on demand, quando e dove vuoi. Tutti i contenuti sono prodotti e di proprietà di Lira TV.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Caratteristiche</Text>
        <View style={styles.featureList}>
          <View style={styles.featureItem}>
            <View style={styles.featureIcon}>
              <Tv color={Colors.dark.accent} size={24} />
            </View>
            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>Streaming Live</Text>
              <Text style={styles.featureDescription}>
                Guarda il canale in diretta con qualità HD
              </Text>
            </View>
          </View>

          <View style={styles.featureItem}>
            <View style={styles.featureIcon}>
              <PlayCircle color={Colors.dark.accent} size={24} />
            </View>
            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>Video On Demand</Text>
              <Text style={styles.featureDescription}>
                Accedi all&apos;archivio completo dei programmi
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>I Tuoi Interessi</Text>
        <Text style={styles.sectionText}>
          Seleziona le categorie che ti interessano per personalizzare la Home e le News.
        </Text>
        <View style={styles.categoriesGrid}>
          {ALL_NEWS_CATEGORIES.map(cat => {
            const isSelected = preferences.favoriteCategories.includes(cat);
            return (
              <TouchableOpacity
                key={cat}
                style={[styles.categoryChip, isSelected && styles.categoryChipSelected]}
                onPress={() => handleToggleCategory(cat)}
                activeOpacity={0.7}
              >
                {isSelected && <Check color={Colors.dark.background} size={14} />}
                <Text style={[styles.categoryChipText, isSelected && styles.categoryChipTextSelected]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {preferences.favoriteCategories.length > 0 && (
          <View style={styles.prefsActiveRow}>
            <Heart color={Colors.dark.accent} size={14} fill={Colors.dark.accent} />
            <Text style={styles.prefsActiveText}>
              {preferences.favoriteCategories.length} categorie selezionate
            </Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Contatti</Text>
        <TouchableOpacity style={styles.contactButton} onPress={handleWebsitePress}>
          <Globe color={Colors.dark.accent} size={20} />
          <Text style={styles.contactButtonText}>Visita il Sito Web</Text>
          <ExternalLink color={Colors.dark.textSecondary} size={16} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.contactButton, styles.privacyButton]} onPress={handlePrivacyPress}>
          <Shield color={Colors.dark.accent} size={20} />
          <Text style={styles.contactButtonText}>Privacy Policy</Text>
          <ExternalLink color={Colors.dark.textSecondary} size={16} />
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Supporto Tecnico</Text>
        <TouchableOpacity
          style={styles.contactButton}
          onPress={() => Linking.openURL('mailto:info@liratv.it').catch(() => {})}
        >
          <Mail color={Colors.dark.accent} size={20} />
          <Text style={styles.contactButtonText}>info@liratv.it</Text>
          <ExternalLink color={Colors.dark.textSecondary} size={16} />
        </TouchableOpacity>
        {deviceId ? (
          <View style={styles.deviceIdSection}>
            <View style={styles.deviceIdHeader}>
              <Fingerprint color={Colors.dark.textSecondary} size={16} />
              <Text style={styles.deviceIdLabel}>ID Dispositivo</Text>
            </View>
            <TouchableOpacity
              style={styles.deviceIdRow}
              onPress={handleCopyDeviceId}
              activeOpacity={0.7}
            >
              <Text style={styles.deviceIdText} numberOfLines={1} selectable>{deviceId}</Text>
              <Copy color={copied ? Colors.dark.success : Colors.dark.textSecondary} size={16} />
            </TouchableOpacity>
            <Text style={styles.deviceIdNote}>(Mostrato solo a scopo di supporto tecnico)</Text>
            {copied && <Text style={styles.copiedText}>Copiato!</Text>}
          </View>
        ) : null}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Versione 1.0.0</Text>
        <Text style={styles.footerText}>© {new Date().getFullYear()} Lira TV. Tutti i diritti riservati.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  content: {
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  logo: {
    width: 210,
    height: 210,
    marginBottom: 16,
  },
  tagline: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.dark.accent,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  section: {
    paddingHorizontal: 20,
    paddingTop: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.dark.text,
    marginBottom: 16,
  },
  sectionText: {
    fontSize: 15,
    lineHeight: 24,
    color: Colors.dark.textSecondary,
  },
  featureList: {
    gap: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.dark.surface,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    gap: 16,
  },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.dark.text,
    marginBottom: 4,
  },
  featureDescription: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    lineHeight: 20,
  },
  contactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.dark.surface,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  contactButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.dark.text,
    flex: 1,
  },
  privacyButton: {
    marginTop: 12,
  },
  footer: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 40,
    gap: 8,
  },
  footerText: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    textAlign: 'center',
  },
  deviceIdSection: {
    marginTop: 16,
    padding: 16,
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  deviceIdHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  deviceIdLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.dark.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  deviceIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  deviceIdText: {
    flex: 1,
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: Colors.dark.accent,
    letterSpacing: 0.3,
  },
  copiedText: {
    fontSize: 12,
    color: Colors.dark.success,
    marginTop: 6,
    fontWeight: '500' as const,
  },
  deviceIdNote: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    marginTop: 8,
    fontStyle: 'italic' as const,
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 16,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  categoryChipSelected: {
    backgroundColor: Colors.dark.accent,
    borderColor: Colors.dark.accent,
  },
  categoryChipText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.dark.textSecondary,
  },
  categoryChipTextSelected: {
    color: Colors.dark.background,
  },
  prefsActiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
  },
  prefsActiveText: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: Colors.dark.accent,
  },
});
