/**
 * Wiro Realtime — a live voice conversation with a model running
 * on Wiro. See `AGENTS.md` for the architecture and its rules.
 *
 * @format
 */

import React, { useRef } from 'react';
import { StatusBar, StyleSheet, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { createHomeControllers } from './src/app/composition';
import { wiroNavigationTheme, wiroTheme } from './src/app/theme';
import { HomeControllers, HomeScreen } from './src/ui/home/screen';

function App(): React.JSX.Element {
  const colorScheme = useColorScheme();
  const theme = wiroTheme(colorScheme);
  const controllersRef = useRef<HomeControllers | null>(null);
  if (!controllersRef.current) {
    controllersRef.current = createHomeControllers();
  }

  return (
    <GestureHandlerRootView style={styles.fill}>
      <SafeAreaProvider>
        <PaperProvider theme={theme}>
          <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} />
          <NavigationContainer theme={wiroNavigationTheme(theme)}>
            <HomeScreen controllers={controllersRef.current} />
          </NavigationContainer>
        </PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});

export default App;
