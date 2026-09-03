import { Alert } from 'react-native';

export const SystemSettingsCopy = {
  OPEN: 'Open settings',
  ALERT_TITLE: 'Microphone access',
  DISMISS: 'OK',
} as const;

/** The alert a permanently denied microphone raises, once. */
export function presentMicrophoneSettingsAlert(
  message: string | null,
  onOpenSystemSettings: () => void,
  onDismiss: () => void,
): void {
  Alert.alert(
    SystemSettingsCopy.ALERT_TITLE,
    message ?? undefined,
    [
      { text: SystemSettingsCopy.DISMISS, style: 'cancel', onPress: onDismiss },
      { text: SystemSettingsCopy.OPEN, onPress: onOpenSystemSettings },
    ],
    { onDismiss, cancelable: true },
  );
}
