import React, { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import {
  BottomTabBarProps,
  createBottomTabNavigator,
} from '@react-navigation/bottom-tabs';
import { CommonActions, useIsFocused } from '@react-navigation/native';
import { BottomNavigation, Icon } from 'react-native-paper';
import { ConversationSessionController } from '../../services/conversation/sessionController';
import { SpeechSessionController } from '../../services/speech/sessionController';
import { TranscriptionSessionController } from '../../services/transcription/sessionController';
import { AppLifecycleTracker } from './appLifecycle';
import { ConversationScreen } from '../conversation/screen';
import { SpeechScreen } from '../speech/screen';
import { TranscriptionScreen } from '../transcription/screen';

export interface HomeControllers {
  readonly conversation: ConversationSessionController;
  readonly transcription: TranscriptionSessionController;
  readonly speech: SpeechSessionController;
}

export interface HomeScreenProps {
  readonly controllers: HomeControllers;
}

type TabParamList = {
  Conversation: undefined;
  Transcription: undefined;
  Speech: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

const TAB_ICON_SIZE = 24;

/**
 * The destinations stay in `@react-navigation/bottom-tabs`; only the
 * drawing is handed to Paper's Material 3 navigation bar, which is
 * the integration Paper documents for exactly this navigator. The
 * bar is controlled, so a tap is forwarded as a `tabPress` event
 * (so screens can still veto it) and then as a navigate action.
 */
function renderTabBar({
  navigation,
  state,
  descriptors,
  insets,
}: BottomTabBarProps): React.JSX.Element {
  return (
    <BottomNavigation.Bar
      navigationState={state}
      safeAreaInsets={insets}
      onTabPress={({ route, preventDefault }) => {
        const event = navigation.emit({
          type: 'tabPress',
          target: route.key,
          canPreventDefault: true,
        });
        if (event.defaultPrevented) {
          preventDefault();
          return;
        }
        navigation.dispatch({
          ...CommonActions.navigate(route.name, route.params),
          target: state.key,
        });
      }}
      renderIcon={({ route, focused, color }) =>
        descriptors[route.key].options.tabBarIcon?.({
          focused,
          color,
          size: TAB_ICON_SIZE,
        }) ?? null
      }
      getLabelText={({ route }) => {
        const { options } = descriptors[route.key];
        return typeof options.tabBarLabel === 'string'
          ? options.tabBarLabel
          : options.title ?? route.name;
      }}
      getTestID={({ route }) => descriptors[route.key].options.tabBarButtonTestID}
      getAccessibilityLabel={({ route }) =>
        descriptors[route.key].options.tabBarAccessibilityLabel
      }
    />
  );
}

/**
 * Route components read their controller — and report whether
 * Conversation is the visible tab — from context instead of a
 * `Tab.Screen` children render-prop. A stable `component` reference
 * per destination avoids remounting the whole subtree every time
 * `HomeScreen` re-renders (see `react/no-unstable-nested-components`).
 */
interface HomeContextValue {
  readonly controllers: HomeControllers;
  readonly conversationVisibleRef: { current: boolean };
}

const HomeContext = createContext<HomeContextValue | null>(null);

function useHomeContext(): HomeContextValue {
  const value = useContext(HomeContext);
  if (!value) {
    throw new Error('useHomeContext must be used within HomeScreen.');
  }
  return value;
}

/**
 * Three destinations, always mounted from launch: `lazy: false`
 * keeps every tab's session alive under the hood, and only the
 * bar's focus state decides what is visible — same contract as
 * the Compose `MountedDestination` + `alpha`/`zIndex` pair in
 * `RealtimeHomeView.kt`.
 */
export function HomeScreen({ controllers }: HomeScreenProps): React.JSX.Element {
  const conversationVisibleRef = useRef(false);
  const contextValue = useMemo<HomeContextValue>(
    () => ({ controllers, conversationVisibleRef }),
    [controllers, conversationVisibleRef],
  );

  useAppLifecycle(controllers, conversationVisibleRef);

  return (
    <HomeContext.Provider value={contextValue}>
      <Tab.Navigator
        screenOptions={{ headerShown: false, lazy: false }}
        tabBar={renderTabBar}
        backBehavior="none"
      >
        <Tab.Screen
          name="Conversation"
          component={ConversationRoute}
          options={{
            title: 'Conversation',
            tabBarButtonTestID: 'tab-conversation',
            tabBarIcon: ({ focused, color, size }) => (
              <Icon
                source={focused ? 'chat' : 'chat-outline'}
                size={size}
                color={color}
              />
            ),
          }}
        />
        <Tab.Screen
          name="Transcription"
          component={TranscriptionRoute}
          options={{
            title: 'Transcription',
            tabBarButtonTestID: 'tab-transcription',
            tabBarIcon: ({ focused, color, size }) => (
              <Icon
                source={focused ? 'microphone' : 'microphone-outline'}
                size={size}
                color={color}
              />
            ),
          }}
        />
        <Tab.Screen
          name="Speech"
          component={SpeechRoute}
          options={{
            title: 'Speech',
            tabBarButtonTestID: 'tab-speech',
            tabBarIcon: ({ color, size }) => (
              <Icon source="waveform" size={size} color={color} />
            ),
          }}
        />
      </Tab.Navigator>
    </HomeContext.Provider>
  );
}

/**
 * The `ON_STOP` equivalent: backgrounding the whole app hangs up
 * all three sessions, and only Conversation resumes on return — and
 * only if it is the tab the speaker left on. See `AppLifecycleTracker`.
 */
function useAppLifecycle(
  controllers: HomeControllers,
  conversationVisibleRef: { current: boolean },
): void {
  useEffect(() => {
    const tracker = new AppLifecycleTracker(
      (AppState.currentState as AppStateStatus | null) ?? 'active',
    );
    const subscription = AppState.addEventListener('change', nextState => {
      tracker.onStateChange(
        nextState,
        {
          suspendConversation: () => void controllers.conversation.suspend(),
          stopTranscription: () => void controllers.transcription.stop(),
          stopSpeech: () => void controllers.speech.stop(),
          resumeConversation: () => void controllers.conversation.resume(),
        },
        () => conversationVisibleRef.current,
      );
    });
    return () => subscription.remove();
  }, [controllers, conversationVisibleRef]);
}

function ConversationRoute(): React.JSX.Element {
  const { controllers, conversationVisibleRef } = useHomeContext();
  const isVisible = useIsFocused();
  useEffect(() => {
    conversationVisibleRef.current = isVisible;
  }, [isVisible, conversationVisibleRef]);
  return <ConversationScreen controller={controllers.conversation} isVisible={isVisible} />;
}

function TranscriptionRoute(): React.JSX.Element {
  const { controllers } = useHomeContext();
  const isVisible = useIsFocused();
  return <TranscriptionScreen controller={controllers.transcription} isVisible={isVisible} />;
}

function SpeechRoute(): React.JSX.Element {
  const { controllers } = useHomeContext();
  const isVisible = useIsFocused();
  return <SpeechScreen controller={controllers.speech} isVisible={isVisible} />;
}
