import Config from 'react-native-config';

export interface Env {
  readonly wiroApiKey: string;
  readonly wiroApiSecret?: string;
}

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `${name} is missing. Copy .env.example to .env and set ${name}.`,
    );
  }
  return value;
}

export const env: Env = {
  wiroApiKey: required('WIRO_API_KEY', Config.WIRO_API_KEY),
  wiroApiSecret: Config.WIRO_API_SECRET,
};
