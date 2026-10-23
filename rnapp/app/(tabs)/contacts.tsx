import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import PageHeader from '../../src/components/PageHeader';
import { colors, fonts } from '../../src/theme';

export default function ContactsScreen() {
  return (
    <View style={styles.screen}>
      <PageHeader title="联系人" subtitle="记住每一位在乎的人" />
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
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
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: 22, paddingBottom: 28, paddingTop: 6 },
  secT: { fontFamily: fonts.hand, fontSize: 17, color: colors.ink, marginBottom: 8 },
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
});
