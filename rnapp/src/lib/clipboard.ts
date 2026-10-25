// =====================================================================
// 剪贴板工具（M7-09）：一键复制祝福语，复制后由调用方给轻提示。
// 用 expo-clipboard（SDK 57 兼容）。
// =====================================================================
import * as Clipboard from 'expo-clipboard';

/** 将文本写入系统剪贴板；失败时抛出，供调用方提示。 */
export async function copyText(text: string): Promise<void> {
  await Clipboard.setStringAsync(text);
}