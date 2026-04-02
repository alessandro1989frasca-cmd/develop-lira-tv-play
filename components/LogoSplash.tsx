import React, { useRef, useEffect, useCallback } from 'react';
import { StyleSheet, Animated, Easing, Image } from 'react-native';
import { Asset } from 'expo-asset';

interface LogoSplashProps {
  onFinish?: () => void;
}

const GIF_URL = 'https://streamcdng1-a928c0678d284da5b383f29ecc5dfeec.msvdn.net/liratv/splash2.gif';

const homeImage = require('@/assets/images/imagehome.png');
const infoLogo = require('@/assets/images/info-logo.png');

export default function LogoSplash({ onFinish }: LogoSplashProps) {
  const fadeOut = useRef(new Animated.Value(1)).current;
  const hasFinished = useRef(false);

  useEffect(() => {
    Promise.all([
      Asset.loadAsync(homeImage),
      Asset.loadAsync(infoLogo),
    ]).then(() => {
      console.log('[LogoSplash] Home + Info images preloaded');
    }).catch((e) => {
      console.log('[LogoSplash] Image preload error:', e);
    });
  }, []);

  const handleFinish = useCallback(() => {
    if (hasFinished.current) return;
    hasFinished.current = true;
    console.log('[LogoSplash] Fading out');
    Animated.timing(fadeOut, {
      toValue: 0,
      duration: 400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(() => {
      onFinish?.();
    });
  }, [fadeOut, onFinish]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      console.log('[LogoSplash] GIF duration ended, fading out');
      handleFinish();
    }, 4000);

    return () => clearTimeout(timeout);
  }, [handleFinish]);

  useEffect(() => {
    const safetyTimeout = setTimeout(() => {
      console.log('[LogoSplash] Safety timeout reached');
      handleFinish();
    }, 7000);
    return () => clearTimeout(safetyTimeout);
  }, [handleFinish]);

  return (
    <Animated.View style={[styles.container, { opacity: fadeOut }]}>
      <Image
        source={{ uri: GIF_URL }}
        style={styles.gif}
        resizeMode="contain"
        onError={() => {
          console.log('[LogoSplash] GIF load error, skipping');
          handleFinish();
        }}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  gif: {
    width: '80%',
    height: '80%',
  },
});
