import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import PageHeader from '../../src/components/PageHeader';
import { colors, fonts, radius } from '../../src/theme';

export default function HomeScreen() {
  return (
    <View style={styles.screen}>
      <PageHeader title="心意管家" seal />
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {/* 明信片：临近日子 */}
        <View style={[styles.postcard, styles.framed]}>
          <View style={styles.tag}>
            <Text style={styles.tagText}>
              接下来 <Text style={styles.tagBold}>还有 3 天</Text>
            </Text>
          </View>
          <Text style={styles.pcMain}>妈妈的生日</Text>
          <Text style={styles.pcSub}>把祝福、礼物和贺卡都提前备好</Text>
          <Pressable
            style={[styles.btn, styles.btnPine, { marginTop: 16 }]}
            onPress={() => router.push('/content/1')}
          >
            <Text style={styles.btnPineText}>去准备</Text>
          </Pressable>
        </View>

        {/* 重要的人 */}
        <Text style={styles.secT}>
          重要的人 <Text style={styles.secTsmall}>点击进入</Text>
        </Text>
        <View style={styles.list}>
          <Pressable style={styles.row} onPress={() => router.push('/person/1')}>
            <View>
              <Text style={styles.rowName}>妈妈</Text>
              <Text style={styles.rowMeta}>家人 ， 生日 10月26日</Text>
            </View>
            <View style={styles.rowSide}>
              <Text style={[styles.pill, styles.pillWarm]}>3 天</Text>
            </View>
          </Pressable>
          <Pressable style={styles.row} onPress={() => router.push('/person/2')}>
            <View>
              <Text style={styles.rowName}>老徐</Text>
              <Text style={styles.rowMeta}>挚友 ， 结婚纪念 11月2日</Text>
            </View>
            <View style={styles.rowSide}>
              <Text style={styles.pill}>10 天</Text>
            </View>
          </Pressable>
          <Pressable style={styles.row} onPress={() => router.push('/person/3')}>
            <View>
              <Text style={styles.rowName}>小满</Text>
              <Text style={styles.rowMeta}>伴侣 ， 相识周年 12月1日</Text>
            </View>
            <View style={styles.rowSide}>
              <Text style={styles.pill}>38 天</Text>
            </View>
          </Pressable>
          <Pressable style={styles.row} onPress={() => router.push('/person/new')}>
            <Text style={styles.rowAdd}>
              <Text style={styles.plus}>＋ </Text>添加一位想记住的人
            </Text>
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

        {/* 通知提示 */}
        <View style={styles.banner}>
          <Text style={styles.bannerTxt}>通知没开，早上九点我就提醒不到你了。</Text>
          <Pressable style={[styles.btn, styles.btnPine, styles.btnSmall]}>
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
  framed: { borderWidth: 1, borderColor: colors.line },
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
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
    minHeight: 42,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  btnPine: { backgroundColor: colors.camellia },
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
  rowName: { fontFamily: fonts.hand, fontSize: 18, color: colors.ink },
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
  rowAdd: { color: colors.camellia, fontSize: 14 },
  plus: { fontSize: 18, marginRight: 6 },
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