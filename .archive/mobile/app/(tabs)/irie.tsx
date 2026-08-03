import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View, type TextStyle } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { elevation, palette, radius, semantic, spacing, typography } from '@cvip/ui';
import { hasCatalogue } from '../../lib/mode';
import { useIsland } from '../../lib/island';
import { searchCatalogue, type CatalogueItem } from '../../lib/catalogue';
import { applyIntent, matchIntent } from '../../lib/irie';
import { ExperienceCard } from '../../components/ExperienceCard';
import { Chip, Icon, IrieAvatar, IrieStars } from '../../components/kit';

/**
 * Irie AI — the centre tab, drawn to mockup screens 7–10 and 12.
 *
 * Mascot header, a greeting bubble, suggestion chips, user messages on the right in deep green,
 * answers on the left with a row of real experience cards and an "Irie Tip" callout, and a
 * persistent ask bar at the foot.
 *
 * **There is no language model behind this yet** — M7 is where that lands. Every answer is matched
 * by rule in `lib/irie.ts` and every card comes from the same RLS-governed catalogue query the rest
 * of the app uses, which is why it cannot name a listing that does not exist or invent a price.
 * That is stated on the screen, in the header, every time the tab is opened. Operating rule 9
 * covers demo *content*; a demo that lets a room believe it is talking to a model is the same
 * failure one level up.
 *
 * This is also the fallback path the requirement asks for: when the model arrives it goes in front
 * of this, and this stays behind it for when the model is unavailable.
 */

type Message =
  | { id: string; role: 'assistant'; text: string; items?: CatalogueItem[]; tip?: string }
  | { id: string; role: 'user'; text: string };

/** The chips the mockup shows under the greeting. */
const STARTERS = ['Things to Do Now', 'Under $50', 'Family Activities', 'Hidden Gems', 'Rainy Day'];

export default function IrieAI() {
  const { island, destination } = useIsland();
  const place = destination?.name ?? island?.name ?? 'the Caribbean';

  const [catalogue, setCatalogue] = useState<CatalogueItem[]>([]);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [thinking, setThinking] = useState(false);
  const scroller = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    if (!hasCatalogue || !island) return;
    const { items } = await searchCatalogue({
      query: '',
      categories: [],
      sort: 'recommended',
      islandId: island.id,
    });
    setCatalogue(items);
  }, [island?.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // The greeting is a message rather than fixed chrome, so the conversation reads as one column
  // and the chips sit under it exactly as the mockup draws them.
  useEffect(() => {
    setMessages((m) =>
      m.length > 0
        ? m
        : [
            {
              id: 'greeting',
              role: 'assistant',
              text: `Wah Gwaan! 👋 I'm Irie AI, your local concierge. How can I help you discover the best of ${place} today?`,
            },
          ],
    );
  }, [place]);

  const ask = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const stamp = Date.now();
    setDraft('');
    setMessages((m) => [...m, { id: `u${stamp}`, role: 'user', text: trimmed }]);
    setThinking(true);

    // A beat before the answer. Not theatre for its own sake — an answer that lands in the same
    // frame as the question is unreadable as a conversation, and the pause is what lets the eye
    // follow the transcript.
    setTimeout(() => {
      const intent = matchIntent(trimmed);
      setThinking(false);
      setMessages((m) => [
        ...m,
        intent
          ? {
              id: `a${stamp}`,
              role: 'assistant',
              text: intent.reply,
              items: applyIntent(intent, catalogue),
              ...(intent.tip ? { tip: intent.tip } : {}),
            }
          : {
              id: `a${stamp}`,
              role: 'assistant',
              // No guessing. An honest miss beats a confident irrelevant answer.
              text: "I can't answer that one yet. Try one of the suggestions below, or search the full catalogue.",
            },
      ]);
    }, 550);
  };

  return (
    <View style={{ flex: 1, backgroundColor: semantic.background }}>
      <IrieHeader place={place} />

      <ScrollView
        ref={scroller}
        onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl }}
        keyboardShouldPersistTaps="handled"
      >
        {messages.map((m) =>
          m.role === 'user' ? (
            <UserBubble key={m.id} text={m.text} />
          ) : (
            <AssistantTurn key={m.id} message={m} />
          ),
        )}

        {thinking ? <TypingBubble /> : null}

        {/* Suggestion chips stay under the latest turn rather than being buried after the first
            question — the mockup keeps them reachable throughout. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.xs }}
        >
          {STARTERS.map((s) => (
            <Chip key={s} label={s} onPress={() => ask(s)} />
          ))}
        </ScrollView>
      </ScrollView>

      <AskBar value={draft} onChangeText={setDraft} onSend={() => ask(draft)} />
    </View>
  );
}

function IrieHeader({ place }: { place: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm + 4,
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.lg,
        paddingBottom: spacing.sm + 4,
        borderBottomWidth: 1,
        borderBottomColor: semantic.border,
      }}
    >
      <IrieAvatar size={42} />

      <View style={{ flex: 1, gap: 1 }}>
        <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>Irie AI</Text>
        <Text
          numberOfLines={1}
          style={{ ...typography.caption, fontSize: 12, color: semantic.textMuted }}
        >
          Your local concierge · {place}
        </Text>
      </View>

      {/* Said plainly, in the header, every time the tab is opened. */}
      <View
        style={{
          backgroundColor: semantic.surfaceSunken,
          borderRadius: radius.pill,
          paddingVertical: 4,
          paddingHorizontal: spacing.sm + 2,
        }}
      >
        <Text style={{ ...typography.overline, fontSize: 9.5, color: semantic.textAccent }}>
          GUIDED DEMO
        </Text>
      </View>
    </View>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <View style={{ alignItems: 'flex-end' }}>
      <View
        style={{
          maxWidth: '85%',
          backgroundColor: semantic.brand,
          borderRadius: radius.lg,
          borderBottomRightRadius: 6,
          paddingVertical: spacing.sm + 2,
          paddingHorizontal: spacing.md,
        }}
      >
        <Text style={{ ...typography.caption, fontSize: 15, color: semantic.textOnDark }}>{text}</Text>
      </View>
    </View>
  );
}

function AssistantTurn({ message }: { message: Extract<Message, { role: 'assistant' }> }) {
  return (
    <View style={{ gap: spacing.sm + 4 }}>
      {/* White bubble, with Irie's gold-on-green avatar beside it — the mockup pairs every
          assistant turn with the mark so the concierge has a face in the transcript. User turns
          are deep green and unavatared, which is what makes the two sides readable at a glance. */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
        <IrieAvatar size={30} />
        <View
          style={{
            flex: 1,
            alignSelf: 'flex-start',
            backgroundColor: semantic.surface,
            borderWidth: 1,
            borderColor: semantic.border,
            borderRadius: radius.lg,
            borderBottomLeftRadius: 6,
            paddingVertical: spacing.sm + 2,
            paddingHorizontal: spacing.md,
            ...elevation.card,
          }}
        >
          <Text style={{ ...typography.caption, fontSize: 15, color: semantic.textPrimary }}>
            {message.text}
          </Text>
        </View>
      </View>

      {/* Real listings, from the same query the rest of the app runs. This is the one place the
          grid card survives: three small cards scrolling sideways inside an answer is the mockup's
          intent, rather than a full-width list swallowing the conversation. */}
      {message.items && message.items.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.sm + 4, paddingRight: spacing.lg }}
        >
          {message.items.map((item) => (
            <View key={item.id} style={{ width: 180 }}>
              <ExperienceCard item={item} variant="grid" />
            </View>
          ))}
        </ScrollView>
      ) : null}

      {message.tip ? <IrieTip text={message.tip} /> : null}
    </View>
  );
}

/** The gold-tinted callout the mockup labels "Irie Tip". General advice, never a claim. */
function IrieTip({ text }: { text: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: spacing.sm + 2,
        backgroundColor: semantic.tintPremium,
        borderRadius: radius.md,
        padding: spacing.sm + 4,
      }}
    >
      <IrieStars size={16} color={palette.goldDeep} />
      <Text style={{ ...typography.caption, fontSize: 13, flex: 1, color: palette.goldDeep }}>
        <Text style={{ ...typography.captionStrong, fontSize: 13, color: palette.goldDeep }}>
          Irie Tip:{' '}
        </Text>
        {text}
      </Text>
    </View>
  );
}

function TypingBubble() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
      <IrieAvatar size={30} />
      <View
        accessible
        accessibilityLabel="Irie AI is replying"
        style={{
          flexDirection: 'row',
          gap: 5,
          backgroundColor: semantic.surface,
          borderWidth: 1,
          borderColor: semantic.border,
          borderRadius: radius.lg,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.md,
        }}
      >
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: radius.pill,
              backgroundColor: semantic.textMuted,
              opacity: 0.35 + i * 0.2,
            }}
          />
        ))}
      </View>
    </View>
  );
}

function AskBar({
  value,
  onChangeText,
  onSend,
}: {
  value: string;
  onChangeText: (v: string) => void;
  onSend: () => void;
}) {
  const ready = value.trim().length > 0;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.sm + 2,
        paddingBottom: spacing.lg,
        borderTopWidth: 1,
        borderTopColor: semantic.border,
        backgroundColor: semantic.background,
      }}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: semantic.surface,
          borderWidth: 1,
          borderColor: semantic.border,
          borderRadius: radius.pill,
          paddingVertical: spacing.sm + 3,
          paddingHorizontal: spacing.md,
        }}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={onSend}
          returnKeyType="send"
          placeholder="Ask me anything..."
          placeholderTextColor={semantic.textMuted}
          accessibilityLabel="Ask Irie AI"
          style={[
            { ...typography.body, fontSize: 15, color: semantic.textPrimary },
            { outlineStyle: 'none' } as unknown as TextStyle,
          ]}
        />
      </View>

      <Pressable
        onPress={onSend}
        disabled={!ready}
        accessibilityRole="button"
        accessibilityLabel="Send"
        accessibilityState={{ disabled: !ready }}
        style={({ pressed }) => ({
          width: 46,
          height: 46,
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: ready ? semantic.brand : semantic.surfaceSunken,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Icon name="arrow-up" size={19} color={ready ? semantic.textOnDark : semantic.textMuted} />
      </Pressable>
    </View>
  );
}
