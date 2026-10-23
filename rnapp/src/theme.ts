import { Platform } from 'react-native';

// 山茶 + 檀墨 配色，与 prototype.html 的 :root 令牌保持一致
export const colors = {
  page: '#F3E7E7',
  paper: '#F9EEED',
  paper2: '#FDF8F7',
  ink: '#3A2627',
  ink2: '#705554',
  ink3: '#9C817F',
  camellia: '#CE7480',
  camelliaDeep: '#B85E6B',
  rose: '#E2B7BD',
  roseTint: '#F7E3E5',
  camelliaTint: '#F6E2E1',
  teal: '#83AAA3',
  gold: '#C6A15B',
  line: '#E5CECC',
  shadow: '#5A2D34',
};

// 楷体只用在「信」的时刻（标题、祝福正文），其余用系统黑体
export const fonts = {
  hand: Platform.select({
    ios: 'Kaiti SC',
    android: 'serif',
    default: 'serif',
  }),
  ui: Platform.select({
    ios: 'PingFang SC',
    android: 'sans-serif',
    default: 'sans-serif',
  }),
};

export const radius = {
  xl: 18,
  md: 12,
  sm: 8,
};