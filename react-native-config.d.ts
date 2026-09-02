declare module 'react-native-config' {
  export interface NativeConfig {
    WIRO_API_KEY?: string;
    WIRO_API_SECRET?: string;
  }

  export const Config: NativeConfig;
  export default Config;
}
