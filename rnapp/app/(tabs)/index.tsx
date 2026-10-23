import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import PageHeader from '../../src/components/PageHeader';
import { colors, fonts, radius } from '../../src/theme';

export default function ReminderScreen() {
  return (
    <View style={styles.screen}>
      <PageHeader title="提醒" subtitle="重要的日子，我会提前提醒你" />
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {/* 明信片：最近一个临近日子 */}
        <View style={styles.postcard}>
          <View style={styles.tag}>
            <Text style={styles.tagText}>
              接下来 <Text style={styles.tagBold}>还有 3 天</Text>
            </Text>
          </View>
          <Text style={styles.pcMain}>妈妈的生日</Text>
          <Text style={styles.pcSub}>把祝福、礼物和贺卡都提前备好</Text>
          <Pressable
            style={[styles.btnPine, { marginTop: 16 }]}
            onPress={() => router.push('/content/1')}
          >
            <Text style={styles.btnPineText}>去准备</Text>
          </Pressable>
        </View>

        {/* 近日心意 */}
        <Text style={styles.secT}>
          近日心意 <Text style={styles.secTsmall}>未来 30 天</Text>
        </Text>
        <View style={styles.list}>
          <Pressable style={styles.row} onPress={() => router.push('/content/1')}>
            <View>
              <Text style={styles.rowNameSmall}>妈妈的生日</Text>
              <Text style={styles.rowMeta}>10月26日</Text>
            </View>
            <View style={styles.rowSide}>
              <Text style={[styles.pill, styles.pillWarm]}>3 天后</Text>
            </View>
          </Pressable>
          <Pressable style={styles.row} onPress={() => router.push('/content/2')}>
            <View>
              <Text style={styles.rowNameSmall}>老徐的结婚纪念</Text>
              <Text style={styles.rowMeta}>11月2日</Text>
            </View>
            <View style={styles.rowSide}>
              <Text style={styles.pill}>10 天后</Text>
            </View>
          </Pressable>
        </View>

        {/* 通知未开提示 */}
        <View style={styles.banner}>
          <Text style={styles.bannerTxt}>通知没开，早上九点我就提醒不到你了。</Text>
          <Pressable style={[styles.btnPine, styles.btnSmall]}>
            <Text style={styles.btnPineText}>打开通知</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: 22, paddingBottom: 28, paddingTop: 6 },
  postcard: {
    backgroundColor: colors.paper2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.xl,
    padding: 20,
    paddingBottom: 18,
  },
  tag: {
    alignSelf: 'flex-start',
    backgroundColor: colors.camelliaTint,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  tagText: { fontSize: 12.5, color: '#8F4E55' },
  tagBold: { fontWeight: '600' },
  pcMain: { fontFamily: fonts.hand, fontSize: 26, lineHeight: 32, color: colors.ink, marginTop: 12 },
  pcSub: { fontSize: 13.5, color: colors.ink2, marginTop: 4 },
  btnPine: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.camellia,
    minHeight: 42,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  btnPineText: { color: '#FCF4F4', fontSize: 14.5, fontWeight: '600' },
  btnSmall: { minHeight: 36, paddingVertical: 7, paddingHorizontal: 12 },
  secT: { fontFamily: fonts.hand, fontSize: 17, color: colors.ink, marginTop: 24, marginBottom: 8 },
  secTsmall: { fontSize: 12, color: colors.ink2, fontFamily: fonts.ui, marginLeft: 8 },
  list: { borderTopWidth: 1, borderTopColor: colors.line },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  rowNameSmall: { fontFamily: fonts.hand, fontSize: 15, color: colors.ink },
  rowMeta: { fontSize: 12.5, color: colors.ink2 },
  rowSide: { marginLeft: 'auto', alignItems: 'flex-end' },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    fontSize: 12,
    backgroundColor: colors.roseTint,
    color: colors.camelliaDeep,
    overflow: 'hidden',
  },
  pillWarm: { backgroundColor: colors.camelliaTint, color: '#8F4E55' },
  banner: {
    backgroundColor: colors.roseTint,
    borderWidth: 1,
    borderColor: colors.rose,
    borderRadius: radius.md,
    padding: 12,
    paddingLeft: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 18,
  },
  bannerTxt: { flex: 1, fontSize: 13, color: colors.ink2 },
});
