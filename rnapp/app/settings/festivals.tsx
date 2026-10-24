import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { FESTIVALS, type Festival } from '../../src/settings/festivals';
import { useSettings } from '../../src/settings/SettingsContext';
import { colors } from '../../src/theme';

function FestivalRow({ festival }: { festival: Festival }) {
  const { followedFestivals, toggleFestival } = useSettings();
  const on = followedFestivals[festival.id];
  return (
    <View style={styles.row}>
      <View style={styles.texts}>
        <View style={styles.titleRow}>
          <Text style={styles.name}>{festival.name}</Text>
          {festival.type === 'targeted' ? <Text style={styles.tag}>指向性</Text> : null}
        </View>
        <Text style={styles.note}>{festival.calculationRule ?? festival.note}</Text>
        {festival.note && festival.type === 'targeted' ? (
          <Text style={styles.note}>{festival.note}</Text>
        ) : null}
      </View>
      <Switch
        value={on}
        onValueChange={(value) => toggleFestival(festival.id, value)}
        trackColor={{ false: colors.line, true: colors.rose }}
        thumbColor={on ? colors.camellia : colors.paper2}
      />
    </View>
  );
}

function FestivalGroup({ title, items }: { title: string; items: Festival[] }) {
  return (
    <View>
      <Text style={styles.groupTitle}>{title}</Text>
      <View style={styles.card}>
        {items.map((f, i) => (
          <View key={f.id}>
            {i > 0 ? <View style={styles.sep} /> : null}
            <FestivalRow festival={f} />
          </View>
        ))}
      </View>
    </View>
  );
}

export default function FestivalsSettingsScreen() {
  const { followedCount } = useSettings();
  const solar = FESTIVALS.filter((f) => f.kind !== 'lunar');
  const lunar = FESTIVALS.filter((f) => f.kind === 'lunar');

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.summary}>
        已关注 <Text style={styles.count}>{followedCount}</Text> / {FESTIVALS.length} 个节日，取消关注的节日不会推送提醒。
      </Text>
      <FestivalGroup title="公历节日" items={solar} />
      <FestivalGroup title="农历节日" items={lunar} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 22, gap: 18 },
  summary: { fontSize: 13.5, color: colors.ink2, lineHeight: 20 },
  count: { fontSize: 17, fontWeight: '700', color: colors.camelliaDeep },

  groupTitle: { fontSize: 12.5, color: colors.ink3, marginBottom: 6, marginLeft: 2 },
  card: {
    backgroundColor: colors.paper2,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  texts: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 15, color: colors.ink, fontWeight: '600' },
  tag: {
    fontSize: 10,
    color: colors.camelliaDeep,
    backgroundColor: colors.camelliaTint,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
  note: { fontSize: 12, color: colors.ink3, marginTop: 2 },
  sep: { height: 1, backgroundColor: colors.line, marginLeft: 14 },
});
