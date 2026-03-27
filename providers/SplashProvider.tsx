import { useState, useMemo } from 'react';
import createContextHook from '@nkzw/create-context-hook';

export const [SplashProvider, useSplash] = createContextHook(() => {
  const [isSplashVisible, setIsSplashVisible] = useState(true);
  return useMemo(() => ({ isSplashVisible, setIsSplashVisible }), [isSplashVisible]);
});
